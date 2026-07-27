import { useAuth } from "@clerk/react";
import { tripMapEndpoint } from "@voyage/contracts";
import { ArrowUpRight, MapPinned } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function googleMapsUrl(locations: string[]) {
  if (locations.length > 1) {
    const search = new URLSearchParams({
      api: "1",
      origin: locations[0],
      destination: locations[1],
    });
    return `https://www.google.com/maps/dir/?${search.toString()}`;
  }

  const search = new URLSearchParams({ api: "1", query: locations[0] });
  return `https://www.google.com/maps/search/?${search.toString()}`;
}

function BookingLocationMap({
  className,
  label,
  locations,
  tripId,
}: {
  className?: string;
  label: string;
  locations: string[];
  tripId: string;
}) {
  const { getToken } = useAuth();
  const locationKey = locations
    .map((location) => location.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("\n");
  const visibleLocations = locationKey.split("\n").filter(Boolean);
  const [imageUrl, setImageUrl] = useState<string>();

  useEffect(() => {
    if (!locationKey) return;

    const controller = new AbortController();
    let objectUrl: string | undefined;

    void (async () => {
      const token = await getToken();
      if (!token || controller.signal.aborted) return;

      const response = await fetch(tripMapEndpoint(tripId, locationKey.split("\n")), {
        headers: { Accept: "image/png", Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.ok || !response.headers.get("Content-Type")?.startsWith("image/")) return;

      objectUrl = URL.createObjectURL(await response.blob());
      setImageUrl(objectUrl);
    })().catch(() => undefined);

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [getToken, locationKey, tripId]);

  if (visibleLocations.length === 0) return null;

  return (
    <a
      className={cn(
        "group relative block aspect-[16/7] overflow-hidden bg-[#e9e8e1] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        className,
      )}
      href={googleMapsUrl(visibleLocations)}
      rel="noreferrer"
      target="_blank"
    >
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle at 22% 35%, rgba(119, 143, 138, .22) 0 3%, transparent 3.5%), radial-gradient(circle at 74% 62%, rgba(132, 151, 144, .2) 0 4%, transparent 4.5%), linear-gradient(135deg, transparent 46%, rgba(255,255,255,.7) 47% 49%, transparent 50%)",
        }}
      />
      <div className="absolute inset-0 grid place-items-center text-[#66716d]">
        <MapPinned className="size-5" aria-hidden="true" />
      </div>
      {imageUrl ? (
        <img
          alt={label}
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
          src={imageUrl}
        />
      ) : null}
      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-[0.68rem] font-medium shadow-sm backdrop-blur">
        View map
        <ArrowUpRight className="size-3" aria-hidden="true" />
      </span>
    </a>
  );
}

export { BookingLocationMap };
