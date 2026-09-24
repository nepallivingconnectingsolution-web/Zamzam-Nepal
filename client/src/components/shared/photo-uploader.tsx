import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { api, ApiError } from "@/api/client";
import { toast } from "@/stores/toast.store";
import { cloudinaryPublicIdFromUrl } from "@/lib/cloudinary";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Thumbnail grid + add/delete, shared across every partner panel (hotel
 * property/rooms, bus fleet, vehicle, restaurant, grocery). Always refetches
 * via onChange() after a successful mutation rather than patching local
 * state — matches how every other list in these partner managers refreshes.
 */
export function PhotoUploader({
  photos,
  uploadUrl,
  deleteUrl,
  onChange,
  max = 10,
}: {
  photos: string[];
  uploadUrl: string;
  deleteUrl: (encodedPublicId: string) => string;
  onChange: () => void;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    if (photos.length + files.length > max) {
      toast.error(`You can have at most ${max} photos — delete some before adding more.`);
      return;
    }
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE_BYTES) {
        toast.error("Photos must be 5 MB or smaller.");
        return;
      }
      if (!ALLOWED_TYPES.includes(f.type)) {
        toast.error("Upload a JPG, PNG or WEBP photo.");
        return;
      }
    }
    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      await api.upload(uploadUrl, formData);
      toast.success(files.length > 1 ? "Photos uploaded" : "Photo uploaded");
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't upload photo. Try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(url: string) {
    const publicId = cloudinaryPublicIdFromUrl(url);
    if (!publicId) return;
    setDeletingUrl(url);
    try {
      await api.delete(deleteUrl(encodeURIComponent(publicId)));
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete photo.");
    } finally {
      setDeletingUrl(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {photos.map((url) => (
          <div key={url} className="group relative size-20 overflow-hidden rounded-lg border border-border">
            <img src={url} alt="Business photo" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => handleDelete(url)}
              disabled={deletingUrl === url}
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove photo"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-fg transition-colors hover:bg-surface-2"
          >
            <ImagePlus className="size-4" />
            <span className="text-[10px]">{uploading ? "Uploading…" : "Add"}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
