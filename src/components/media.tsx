import { Film, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

export function thumbUrl(driveFileId: string) {
  return `/api/media/thumb/${encodeURIComponent(driveFileId)}`;
}
export function streamUrl(driveFileId: string) {
  return `/api/media/stream/${encodeURIComponent(driveFileId)}`;
}

/** Thumbnail with fixed aspect ratio. Decorative unless `alt` is given. */
export function Thumb({
  driveFileId,
  alt = "",
  ratio = "9/16",
  className,
  unavailable,
  children,
}: {
  driveFileId: string | null;
  alt?: string;
  ratio?: "9/16" | "1/1" | "16/9" | "4/5";
  className?: string;
  unavailable?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-teal-100", className)} style={{ aspectRatio: ratio.replace("/", " / ") }}>
      {driveFileId && !unavailable ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbUrl(driveFileId)} alt={alt} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-teal-500">
          {unavailable ? <AlertTriangle className="size-6 text-warning-700" aria-hidden /> : <Film className="size-6" aria-hidden />}
          {unavailable && <span className="px-2 text-center text-[11px] font-semibold text-warning-700">Unavailable in Drive</span>}
        </div>
      )}
      {children}
    </div>
  );
}
