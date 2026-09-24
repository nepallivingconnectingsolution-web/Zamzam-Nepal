import { useEffect, useState } from "react";
import { ExternalLink, FileText, ImageOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Onboarding documents are private: there is no public URL an <img> can load.
 * They are fetched with the caller's token and shown from an in-memory object
 * URL (revoked on unmount), so a file is only ever readable by its owner or a
 * super admin.
 */
export function useBlobUrl(key: string | null, load: () => Promise<Blob>) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!key) {
      setUrl(null);
      setState("idle");
      return;
    }
    let cancelled = false;
    let made: string | null = null;
    setState("loading");
    load()
      .then((blob) => {
        if (cancelled) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
    // `load` is intentionally not a dependency: the key identifies the file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { url, state };
}

interface Props {
  /** Stable id of the file (changes when the file changes). */
  fileKey: string | null;
  load: () => Promise<Blob>;
  mimeType?: string;
  name?: string;
  /** Local preview shown until the server copy is available (just-picked file). */
  localPreview?: string | null;
  className?: string;
}

/** Thumbnail of a private image, or a PDF tile; tap to open it full size in a new tab. */
export function SecureFile({ fileKey, load, mimeType, name, localPreview, className }: Props) {
  const { url, state } = useBlobUrl(fileKey, load);
  const isPdf = mimeType === "application/pdf";
  const shown = url ?? localPreview ?? null;

  const box = cn("relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2 text-muted-fg", className);

  if (!fileKey && !localPreview) {
    return (
      <div className={box} aria-hidden>
        <FileText className="size-5" />
      </div>
    );
  }
  if (state === "loading" && !shown) {
    return (
      <div className={box} role="status" aria-label="Loading preview">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (state === "error" && !shown) {
    return (
      <div className={box} title="Couldn't load this file">
        <ImageOff className="size-5" />
      </div>
    );
  }
  if (isPdf) {
    return (
      <a href={shown ?? undefined} target="_blank" rel="noreferrer" className={cn(box, "text-teal-700 dark:text-accent")} aria-label={`Open ${name ?? "PDF"}`}>
        <FileText className="size-5" />
        <span className="absolute bottom-0.5 text-[9px] font-bold">PDF</span>
      </a>
    );
  }
  return (
    <a href={shown ?? undefined} target="_blank" rel="noreferrer" className={box} aria-label={`Open ${name ?? "image"} full size`}>
      {shown && <img src={shown} alt={name ?? "Uploaded file"} className="size-full object-cover" />}
      <span className="absolute right-0.5 top-0.5 rounded bg-black/40 p-0.5 text-white opacity-0 transition-opacity hover:opacity-100 focus:opacity-100">
        <ExternalLink className="size-3" />
      </span>
    </a>
  );
}
