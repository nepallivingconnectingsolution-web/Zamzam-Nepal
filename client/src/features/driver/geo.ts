/** A one-off GPS fix, with plain-language reasons when it fails. */
export function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("This device has no location support. ZamZam needs your location to match you with riders."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        reject(
          new Error(
            "Location is turned off for ZamZam. Allow location access in your browser or phone settings, then try again.",
          ),
        );
      } else {
        reject(new Error("We couldn't find your location. Move to an open area and try again."));
      }
    }, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 12_000 });
  });
}

/** The optional GPS quality fields, only when the device actually reported them. */
export function positionExtras(pos: GeolocationPosition) {
  const { accuracy, heading, speed } = pos.coords;
  const ok = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
  return {
    ...(ok(accuracy) ? { accuracy } : {}),
    ...(ok(heading) && heading <= 360 ? { heading } : {}),
    ...(ok(speed) ? { speed } : {}),
  };
}
