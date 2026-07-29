import { useAuth } from "@clerk/react";
import { type Stay, stayPropertyPhotoEndpoint } from "@voyage/contracts";
import { ArrowUpRight, Camera, Map as MapIcon, Phone, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { BookingLocationMap } from "@/components/booking-location-map";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStayProperty } from "@/lib/planning";

function StayPropertyContext({ item, tripId }: { item: Stay; tripId: string }) {
  const { getToken } = useAuth();
  const property = useStayProperty(tripId, item.id, Boolean(item.propertyRef));
  const [view, setView] = useState<"photo" | "map">("photo");
  const [photoUrl, setPhotoUrl] = useState<string>();
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    if (!item.propertyRef || !property.data?.hasPhoto || view !== "photo") return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void (async () => {
      const token = await getToken();
      if (!token || controller.signal.aborted) {
        if (!controller.signal.aborted) setPhotoFailed(true);
        return;
      }
      const response = await fetch(stayPropertyPhotoEndpoint(tripId, item.id), {
        headers: { Authorization: `Bearer ${token}`, Accept: "image/*" },
        signal: controller.signal,
      });
      if (!response.ok || !response.headers.get("Content-Type")?.startsWith("image/")) {
        setPhotoFailed(true);
        return;
      }
      objectUrl = URL.createObjectURL(await response.blob());
      setPhotoUrl(objectUrl);
    })().catch(() => {
      if (!controller.signal.aborted) setPhotoFailed(true);
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [getToken, item.id, item.propertyRef, property.data?.hasPhoto, tripId, view]);

  const canShowPhoto = Boolean(property.data?.hasPhoto) && !photoFailed;
  const showingPhoto = view === "photo" && canShowPhoto;

  return (
    <div>
      <div className="-mx-5 -mt-3 mb-5">
        {item.propertyRef ? (
          <div className="flex justify-end gap-1 border-b bg-background px-3 py-2">
            <Button
              type="button"
              size="sm"
              variant={showingPhoto ? "secondary" : "ghost"}
              disabled={!canShowPhoto}
              onClick={() => setView("photo")}
            >
              <Camera className="size-3.5" aria-hidden="true" /> Photo
            </Button>
            <Button
              type="button"
              size="sm"
              variant={!showingPhoto ? "secondary" : "ghost"}
              onClick={() => setView("map")}
            >
              <MapIcon className="size-3.5" aria-hidden="true" /> Map
            </Button>
          </div>
        ) : null}
        {showingPhoto ? (
          <div className="relative aspect-[16/7] overflow-hidden bg-muted">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={property.data ? `${property.data.displayName} property` : item.propertyName}
                className="size-full object-cover"
              />
            ) : (
              <Skeleton className="size-full rounded-none" />
            )}
            {property.data?.photo ? (
              <a
                href={property.data.photo.googleMapsUri}
                target="_blank"
                rel="noreferrer"
                className="absolute bottom-2 right-2 rounded-md bg-background/90 px-2 py-1 text-[0.65rem] shadow-sm backdrop-blur"
              >
                {property.data.photo.attributionDisplayName
                  ? `Photo by ${property.data.photo.attributionDisplayName}`
                  : "View photo on Google Maps"}
              </a>
            ) : null}
          </div>
        ) : (
          <BookingLocationMap
            label={`Map showing ${item.address}`}
            locations={[item.address]}
            tripId={tripId}
          />
        )}
      </div>

      {item.propertyRef ? (
        property.isPending ? (
          <div className="mb-5 grid gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : property.data ? (
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {property.data.primaryTypeDisplayName ? (
                <span className="font-medium">{property.data.primaryTypeDisplayName}</span>
              ) : null}
              {property.data.rating !== null ? (
                <a
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  href={property.data.googleMapsUri}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Star className="size-3.5 fill-amber-400 text-amber-500" aria-hidden="true" />
                  {property.data.rating.toFixed(1)}
                  {property.data.userRatingCount !== null
                    ? ` (${property.data.userRatingCount.toLocaleString()})`
                    : ""}
                </a>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2">
              {property.data.websiteUri ? (
                <a
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted/50"
                  href={property.data.websiteUri}
                  target="_blank"
                  rel="noreferrer"
                >
                  Official website <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </a>
              ) : null}
              {property.data.internationalPhoneNumber || property.data.nationalPhoneNumber ? (
                <a
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted/50"
                  href={`tel:${property.data.internationalPhoneNumber ?? property.data.nationalPhoneNumber}`}
                >
                  <Phone className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  {property.data.internationalPhoneNumber ?? property.data.nationalPhoneNumber}
                </a>
              ) : null}
            </div>
            <p className="mt-2 text-right text-[0.65rem] text-muted-foreground" translate="no">
              Property details from Google Maps
            </p>
          </div>
        ) : (
          <p className="mb-5 text-xs text-muted-foreground">
            Live property details are temporarily unavailable. Your booking is still available
            below.
          </p>
        )
      ) : null}
    </div>
  );
}

export { StayPropertyContext };
