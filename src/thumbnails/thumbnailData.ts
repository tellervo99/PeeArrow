import { BrandingUUID } from "../videoBranding/videoBranding";
import { cacheUsed, getFromCache, setupCache } from "./thumbnailDataCache";
import { VideoID } from "@ajayyy/maze-utils/lib/video";

interface PartialThumbnailResult {
    votes: number;
    locked: boolean;
    UUID: BrandingUUID;
}

export type CustomThumbnailSubmission = {
    timestamp: number;
    original: false;
};
export type CustomThumbnailResult = PartialThumbnailResult & CustomThumbnailSubmission;

export type OriginalThumbnailSubmission = {
    original: true;
};
export type OriginalThumbnailResult = PartialThumbnailResult & OriginalThumbnailSubmission;

export type ThumbnailResult = CustomThumbnailResult | OriginalThumbnailResult;
export type ThumbnailSubmission = CustomThumbnailSubmission | OriginalThumbnailSubmission;

interface Format {
    url: string;
    width: number;
    height: number;
}

async function fetchFormats(videoID: VideoID, ignoreCache: boolean): Promise<Format[]> {
    const cachedData = getFromCache(videoID);
    if (!ignoreCache && cachedData?.playbackUrls) {
        return cachedData.playbackUrls;
    }

    const start = Date.now();

    const url = "https://www.youtube.com/youtubei/v1/player";
    const data = {
        context: {
            client: {
                clientName: "WEB",
                clientVersion: "2.20211129.09.00"
            }
        },
        videoId: videoID
    };

    try {
        const result = await fetch(url, {
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json'
            },
            method: "POST"
        });

        if (result.ok) {
            type Format = {
                url: string;
                width: number;
                height: number;
            }

            const response = await result.json();
            const formats = response?.streamingData?.adaptiveFormats as Format[];
            if (formats) {
                // Should already be reverse sorted, but reverse sort just incase (not slow if it is correct already)
                const sorted = formats
                    .reverse()
                    .filter((format) => format.width && format.height)
                    .sort((a, b) => a?.width - b?.width);

                console.log(videoID, (Date.now() - start) / 1000, "innerTube");
                const videoCache = setupCache(videoID);
                videoCache.playbackUrls = sorted.map((format) => ({
                    url: format.url,
                    width: format.width,
                    height: format.height
                }))

                return videoCache.playbackUrls;
            }
        }
    } catch (e) { } //eslint-disable-line no-empty

    return [];
}

export async function getPlaybackUrl(videoID: VideoID,
    width?: number, height?: number, ignoreCache = false): Promise<string | null> {
    const formats = await fetchFormats(videoID, ignoreCache);
    //todo: handle fetching fromats twice at the same time, lock or something

    if (width && height) {
        const bestFormat = formats?.find(f => f?.width >= width && f?.height >= height);

        if (bestFormat) {
            cacheUsed(videoID);

            return bestFormat?.url;
        }
    } else if (formats?.length > 0) {
        return formats[0].url;
    }

    return null;
}