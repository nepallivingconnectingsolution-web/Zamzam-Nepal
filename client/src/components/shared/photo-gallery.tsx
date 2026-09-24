import { useState } from "react";
import { Images } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhotoLightbox } from "./photo-lightbox";

const MAX_DESKTOP_TILES = 5;

/** Right-side tile grid, sized to how many small tiles there actually are — avoids empty grid cells for a 2-4 photo set. */
function rightGridClassName(tileCount: number): string {
  if (tileCount <= 1) return "grid-cols-1 grid-rows-1";
  if (tileCount === 2) return "grid-cols-1 grid-rows-2";
  return "grid-cols-2 grid-rows-2";
}

/**
 * Read-only hero gallery for a business's uploaded photos. Renders nothing
 * when there are none. Every photo opens the shared PhotoLightbox at its own
 * index — that's the one place "tap a photo, see it fullscreen" lives, so
 * every detail page that renders this gets it for free.
 */
export function PhotoGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  if (photos.length === 1) {
    return (
      <>
        <button
          type="button"
          onClick={() => setLightboxIndex(0)}
          aria-label={`View photo 1 of 1`}
          className="block aspect-[16/9] w-full overflow-hidden rounded-2xl lg:aspect-[21/9]"
        >
          <img src={photos[0]} alt={alt} className="size-full object-cover" />
        </button>
        <PhotoLightbox
          photos={photos}
          index={0}
          open={lightboxIndex !== null}
          alt={alt}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      </>
    );
  }

  const desktopTiles = photos.slice(0, MAX_DESKTOP_TILES);
  const remaining = photos.length - desktopTiles.length;

  return (
    <>
      {/* Phone/tablet: single hero photo, tap to browse the full set in the lightbox. */}
      <button
        type="button"
        onClick={() => setLightboxIndex(0)}
        aria-label={`View photo 1 of ${photos.length}`}
        className="relative block aspect-[4/3] w-full overflow-hidden rounded-2xl lg:hidden"
      >
        <img src={photos[0]} alt={alt} className="size-full object-cover" />
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
          <Images className="size-3.5" /> {photos.length}
        </span>
      </button>

      {/* Desktop: one large tile + up to four smaller ones, Airbnb-style. */}
      <div className="hidden gap-2 overflow-hidden rounded-2xl lg:grid lg:h-[360px] lg:grid-cols-4 lg:grid-rows-2">
        <button
          type="button"
          onClick={() => setLightboxIndex(0)}
          aria-label={`View photo 1 of ${photos.length}`}
          className="col-span-2 row-span-2 h-full w-full"
        >
          <img src={desktopTiles[0]} alt={alt} className="size-full object-cover" />
        </button>
        <div className={cn("col-span-2 row-span-2 grid gap-2 bg-surface-2", rightGridClassName(desktopTiles.length - 1))}>
          {desktopTiles.slice(1).map((photo, i) => {
            const tileIndex = i + 1;
            const isLastTile = tileIndex === desktopTiles.length - 1;
            // A 3rd tile has nowhere to sit in a 2-column grid alongside the
            // first two without spanning both columns on its own row.
            const spansFullWidth = desktopTiles.length - 1 === 3 && isLastTile;
            return (
              <button
                key={`${photo}-${tileIndex}`}
                type="button"
                onClick={() => setLightboxIndex(tileIndex)}
                aria-label={`View photo ${tileIndex + 1} of ${photos.length}`}
                className={cn("relative h-full w-full", spansFullWidth && "col-span-2")}
              >
                <img src={photo} alt={alt} className="size-full object-cover" />
                {isLastTile && remaining > 0 && (
                  <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/50 text-sm font-semibold text-white">
                    <Images className="size-4" /> +{remaining} more
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <PhotoLightbox
        photos={photos}
        index={lightboxIndex ?? 0}
        open={lightboxIndex !== null}
        alt={alt}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}
