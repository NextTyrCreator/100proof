"use client";

import { useEffect, useId, useState } from "react";
import { searchAddresses, type AddressHit } from "../lib/address-search";
import { ADDRESS_MATCH_MILES, milesBetween } from "../lib/inventory";
import { scanPlaceSchema, useInventory } from "./InventoryProvider";
import { Recorder } from "./Recorder";

function locationError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "This browser did not share a location. Allow it, then press Locate me again. No coordinates were saved.";
  }
  if (error.code === error.TIMEOUT) {
    return "The location request timed out. Press Locate me to try once more. No coordinates were saved.";
  }
  return "This device could not provide a location. Press Locate me to try once more.";
}

export function Walkthrough() {
  const { selected, setInventoryTitle, setHomeAddress, setAddressPoint, pinAddress, setScanPlace } = useInventory();
  const [step, setStep] = useState<"details" | "scan">("details");
  const [hits, setHits] = useState<AddressHit[]>([]);
  const [open, setOpen] = useState(false);
  const [addressFocus, setAddressFocus] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const listId = useId();

  useEffect(() => {
    setStep("details");
  }, [selected?.id]);

  const address = selected?.homeAddress ?? "";
  const pinnedLabel = selected?.addressPoint?.label ?? "";

  useEffect(() => {
    const query = address.trim();
    if (!addressFocus || query.length < 3 || pinnedLabel === query) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchAddresses(query, controller.signal)
        .then((next) => {
          setHits(next);
          setOpen(next.length > 0);
        })
        .catch((failure: unknown) => {
          if (failure instanceof DOMException && failure.name === "AbortError") return;
          setHits([]);
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [address, addressFocus, pinnedLabel]);

  if (!selected) {
    return (
      <section className="narrow record">
        <h1>Start new inventory</h1>
        <p className="lede">Open My inventory and start a new scan. The camera stays off until then.</p>
      </section>
    );
  }

  const inventory = selected;
  const titleReady = inventory.title.trim().length > 0;
  const addressReady = inventory.homeAddress.trim().length > 0;
  const locationReady = inventory.place !== null;
  const ready = titleReady && addressReady && locationReady;
  const miles =
    inventory.place && inventory.addressPoint
      ? milesBetween(inventory.place, inventory.addressPoint)
      : null;

  function choose(hit: AddressHit) {
    setAddressPoint(inventory.id, hit);
    setHits([]);
    setOpen(false);
  }

  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError("This browser cannot share a location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const parsed = scanPlaceSchema.safeParse({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
        });
        setLocating(false);
        if (!parsed.success) {
          setError("The reading was not usable. No coordinates were saved.");
          return;
        }
        setScanPlace(inventory.id, parsed.data);
        if (!inventory.addressPoint && inventory.homeAddress.trim().length >= 3) {
          searchAddresses(inventory.homeAddress)
            .then((next) => {
              const match = next[0];
              if (match) pinAddress(inventory.id, match);
            })
            .catch(() => undefined);
        }
      },
      (failure) => {
        setLocating(false);
        setError(locationError(failure));
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  }

  return (
    <section className="narrow record">
      <h1>Start new inventory</h1>
      <p className="lede">Videos cannot be attached later. This scan happens now.</p>
      {step === "details" ? (
        <div className="sheet scan-setup">
          <label className="field">
            <span>Title</span>
            <input
              value={selected.title}
              maxLength={80}
              required
              placeholder="Name this inventory"
              onChange={(event) => setInventoryTitle(selected.id, event.target.value)}
            />
          </label>
          <div className="address-field">
            <label className="field">
              <span>Address of insured property</span>
              <input
                value={selected.homeAddress}
                maxLength={200}
                required
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-autocomplete="list"
                autoComplete="street-address"
                placeholder="Start typing an address"
                onChange={(event) => setHomeAddress(selected.id, event.target.value)}
                onFocus={() => setAddressFocus(true)}
                onBlur={() => setAddressFocus(false)}
              />
            </label>
            {open && hits.length > 0 ? (
              <ul className="address-suggestions" id={listId} role="listbox">
                {hits.map((hit) => (
                  <li key={`${hit.latitude}-${hit.longitude}-${hit.label}`}>
                    <button type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(hit)}>
                      {hit.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <p className="total-note">
            Locate me takes one reading from this device and compares it with the address. Within a mile, the address
            is checked. Farther than a mile, the distance stays on the record. The browser asks permission first.
            100proof does not keep watching the device, and the device coordinates are not sent with the address
            lookup. This does not decide coverage.
          </p>
          <button type="button" className="button brand" onClick={locate} disabled={locating}>
            {locating ? "Locating" : "Locate me"}
          </button>
          {selected.place && miles != null && miles <= ADDRESS_MATCH_MILES ? (
            <p className="place-check">Checked. This device is within a mile of the insured property.</p>
          ) : null}
          {selected.place && miles != null && miles > ADDRESS_MATCH_MILES ? (
            <p className="place-distance">
              {miles < 10 ? miles.toFixed(1) : Math.round(miles)} miles from the insured property. Not checked.
            </p>
          ) : null}
          {selected.place && miles == null ? (
            <p className="hint">Location recorded. The address was not matched, so the distance was not checked.</p>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {ready ? (
            <button type="button" className="button brand" onClick={() => setStep("scan")}>
              Next
            </button>
          ) : null}
        </div>
      ) : (
        <Recorder />
      )}
    </section>
  );
}
