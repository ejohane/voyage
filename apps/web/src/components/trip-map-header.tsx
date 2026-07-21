import { useAuth } from "@clerk/react";
import type { Trip } from "@voyage/contracts";
import { tripMapEndpoint } from "@voyage/contracts";
import { MapPinned } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatTripDestinations } from "@/lib/format-trip";
import { cn } from "@/lib/utils";

type TripMapHeaderProps = {
  trip: Trip;
  className?: string;
  eager?: boolean;
};

function TripMapHeader({ trip, className, eager = false }: TripMapHeaderProps) {
  const { getToken } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(eager);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (eager) return;

    const element = containerRef.current;
    if (!element) return;

    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "240px" },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!shouldLoad) return;

    const controller = new AbortController();
    let objectUrl: string | null = null;

    void (async () => {
      const token = await getToken();
      if (!token || controller.signal.aborted) return;

      const response = await fetch(tripMapEndpoint(trip.id), {
        headers: {
          Accept: "image/png",
          Authorization: `Bearer ${token}`,
        },
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
  }, [getToken, shouldLoad, trip.id]);

  return (
    <div
      ref={containerRef}
      className={cn("relative aspect-[2/1] overflow-hidden bg-[#e9e8e1]", className)}
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
          alt={`Map showing ${formatTripDestinations(trip)}`}
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
          decoding="async"
          loading={eager ? "eager" : "lazy"}
          src={imageUrl}
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/8 via-transparent to-white/5" />
    </div>
  );
}

export { TripMapHeader };
