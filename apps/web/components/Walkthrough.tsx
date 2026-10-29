"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ADDRESS_REGIONS, resolveAddress, searchAddresses, type AddressHit } from "../lib/address-search";
import { scanPlaceSchema, useInventory } from "./InventoryProvider";
import { Recorder } from "./Recorder";

const LOCATION_RETRY = "Location was not accepted. Press Next and allow location. A scan cannot start without it.";

function locationError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location is blocked. Allow location for this site, then press Next and accept it. A scan cannot start without it.";
  }
  return LOCATION_RETRY;
}

export function Walkthrough() {
  const { selected, startInventory, setInventoryTitle, setAddressRegion, setHomeAddress, setAddressPoint, pinAddress, setScanPlace } =
    useInventory();
  const startInventoryRef = useRef(startInventory);
  startInventoryRef.current = startInventory;
  const [step, setStep] = useState<"details" | "scan">("details");
  const [hits, setHits] = useState<AddressHit[]>([]);
  const [open, setOpen] = useState(false);
  const [addressFocus, setAddressFocus] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const listId = useId();
  const router = useRouter();
  const adding = useSearchParams().get("add") === "1";

  useEffect(() => {
    if (!selected) startInventoryRef.current();
  }, [selected]);

  useEffect(() => {
    setStep("details");
    setError("");
    setLocating(false);
  }, [selected?.id]);

  useEffect(() => {
    if (adding && selected?.place) setStep("scan");
  }, [adding, selected?.id, selected?.place]);

  const address = selected?.homeAddress ?? "";
  const regionId = selected?.addressRegion ?? "";
  const pinnedLabel = selected?.addressPoint?.label ?? "";

  useEffect(() => {
    const query = address.trim();
    if (!regionId || !addressFocus || query.length < 3 || pinnedLabel === query) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchAddresses(query, regionId, controller.signal)
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
  }, [address, addressFocus, pinnedLabel, regionId]);

  const inventory = selected ?? {
    id: "",
    title: "",
    homeAddress: "",
    addressRegion: "",
    addressPoint: null,
    place: null,
  };
  const titleReady = inventory.title.trim().length > 0;
  const addressReady = inventory.addressRegion.length > 0 && inventory.homeAddress.trim().length > 0;
  const ready = titleReady && addressReady;

  async function choose(hit: AddressHit) {
    setError("");
    setHits([]);
    setOpen(false);
    const point = await resolveAddress(hit);
    if (!point) {
      setHomeAddress(inventory.id, hit.label);
      return;
    }
    setAddressPoint(inventory.id, point);
  }

  async function matchAddress() {
    const typed = inventory.homeAddress.trim();
    if (
      inventory.addressPoint &&
      inventory.addressPoint.label.trim().toLowerCase() === typed.toLowerCase()
    ) {
      return;
    }
    const matches = await searchAddresses(typed, inventory.addressRegion);
    const match = matches[0];
    if (!match) return;
    const point = await resolveAddress(match);
    if (point) pinAddress(inventory.id, point);
  }

  function goNext() {
    setError("");
    if (!inventory.addressRegion) {
      setError("Choose a country, then press Next.");
      return;
    }
    if (inventory.homeAddress.trim().length < 3) {
      setError("Enter the address, then press Next.");
      return;
    }
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
        if (!parsed.success) {
          setLocating(false);
          setError(LOCATION_RETRY);
          return;
        }
        setScanPlace(inventory.id, parsed.data);
        matchAddress()
          .catch(() => undefined)
          .finally(() => {
            setLocating(false);
            setStep("scan");
          });
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
      {step === "details" ? (
        <div className="sheet scan-setup">
          <label className="field">
            <span>
              Title<span className="required" aria-hidden="true">*</span>
            </span>
            <input
              value={inventory.title}
              maxLength={80}
              required
              placeholder="Name this inventory"
              onChange={(event) => {
                if (inventory.id) setInventoryTitle(inventory.id, event.target.value);
              }}
            />
          </label>
          <label className="field">
            <span>
              Country<span className="required" aria-hidden="true">*</span>
            </span>
            <select
              value={inventory.addressRegion}
              required
              onChange={(event) => {
                setError("");
                if (inventory.id) setAddressRegion(inventory.id, event.target.value);
              }}
            >
              <option value="">Select a country</option>
              {ADDRESS_REGIONS.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.label}
                </option>
              ))}
            </select>
          </label>
          {inventory.addressRegion ? (
          <div className="address-field">
            <label className="field">
              <span>
                Address of insured property<span className="required" aria-hidden="true">*</span>
              </span>
              <input
                value={inventory.homeAddress}
                maxLength={300}
                required
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-autocomplete="list"
                autoComplete="street-address"
                placeholder="Start typing an address"
                onChange={(event) => {
                  setError("");
                  if (inventory.id) setHomeAddress(inventory.id, event.target.value);
                }}
                onFocus={() => setAddressFocus(true)}
                onBlur={() => setAddressFocus(false)}
              />
            </label>
            {open && hits.length > 0 ? (
              <ul className="address-suggestions" id={listId} role="listbox">
                {hits.map((hit) => (
                  <li key={hit.magicKey}>
                    <button type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => void choose(hit)}>
                      {hit.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {ready ? (
            <button type="button" className="button brand" onClick={goNext} disabled={locating}>
              {locating ? "Checking" : "Next"}
            </button>
          ) : null}
        </div>
      ) : inventory.place ? (
        <Recorder
          onBack={() => {
            if (adding) {
              router.push("/");
              return;
            }
            setError("");
            setStep("details");
          }}
        />
      ) : null}
    </section>
  );
}
