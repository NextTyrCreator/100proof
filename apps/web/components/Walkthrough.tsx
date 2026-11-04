"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ADDRESS_REGIONS, resolveAddress, searchAddresses, type AddressHit } from "../lib/address-search";
import { locationWithin } from "../lib/inventory";
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
  const [stage, setStage] = useState<"name" | "country" | "address" | "ready">("name");
  const [verifiedTip, setVerifiedTip] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const [hits, setHits] = useState<AddressHit[]>([]);
  const [open, setOpen] = useState(false);
  const [addressFocus, setAddressFocus] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const listId = useId();
  const router = useRouter();
  const params = useSearchParams();
  const adding = params.get("add") === "1";
  const focusParam = params.get("focus") ?? "";
  const focusIds = useMemo(
    () =>
      focusParam
        .split(",")
        .map((id) => id.trim())
        .filter((id) => /^[\w-]{1,80}$/.test(id))
        .slice(0, 10),
    [focusParam],
  );

  useEffect(() => {
    if (!selected) startInventoryRef.current();
  }, [selected]);

  useEffect(() => {
    setStep("details");
    setError("");
    setLocating(false);
    const title = selected?.title.trim() ?? "";
    const region = selected?.addressRegion ?? "";
    setStage(title && region ? "address" : title ? "country" : "name");
    // Only when a different inventory opens. Typing must not skip the question in front of them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const country = ADDRESS_REGIONS.find((region) => region.id === inventory.addressRegion)?.label ?? "";
  const typedStreet = inventory.addressPoint?.street || (inventory.addressPoint ? "" : inventory.homeAddress.trim());
  const placeLine = [inventory.addressPoint?.city, inventory.addressPoint?.state, inventory.addressPoint?.county].filter(Boolean).join(", ");
  const addressReady = inventory.addressRegion.length > 0 && inventory.homeAddress.trim().length > 0;
  const ready = titleReady && addressReady;
  const within = selected ? locationWithin(selected) : null;
  const streetShown = stage === "ready" ? typedStreet || inventory.homeAddress.trim() : "";

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

  useEffect(() => {
    if (step !== "details") return;
    if (stage === "country" || stage === "ready") return;
    const field = stage === "name" ? nameRef.current : addressRef.current;
    field?.focus();
  }, [stage, step]);

  function goBack() {
    setError("");
    setVerifiedTip(false);
    if (stage === "name") {
      router.push("/");
      return;
    }
    if (stage === "country") setStage("name");
    if (stage === "address") setStage("country");
    if (stage === "ready") setStage("address");
  }

  function commitName() {
    if (!titleReady) return;
    setError("");
    setStage(inventory.addressRegion ? "address" : "country");
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
            setStage("ready");
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
      {step === "details" ? (
        <div className="sheet scan-setup wizard">
          {stage !== "name" && inventory.title.trim() ? (
            <div className="wizard-card is-filled">
              <p className="wizard-line">{inventory.title.trim()}</p>
              {streetShown ? (
                <p className="wizard-line is-address wizard-street">
                  <span>{streetShown}</span>
                  {within === true ? (
                    <span className="wizard-check-wrap">
                      <button
                        type="button"
                        className="place-mark wizard-check"
                        aria-label="Location verified"
                        onClick={() => setVerifiedTip((openTip) => !openTip)}
                      >
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <path d="M3.4 8.2 L6.5 11.2 L12.6 4.6" />
                        </svg>
                      </button>
                      {verifiedTip ? (
                        <span className="wizard-tip" role="tooltip">
                          Location verified
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </p>
              ) : null}
              {within === false && stage === "ready" ? (
                <p className="place-distance">Allow location and make sure this device is within 1 mile for full verification.</p>
              ) : null}
              {country ? <p className="wizard-line is-address">{country}</p> : null}
              {stage === "ready" && placeLine ? <p className="wizard-line is-address">{placeLine}</p> : null}
            </div>
          ) : null}
          <div className="wizard-ask">
          {stage !== "ready" ? (
          <h1 className="wizard-question">
            {stage === "name"
              ? "What is the name of this inventory?"
              : stage === "country"
                ? "What country is this property in?"
                : "What is the address?"}
          </h1>
          ) : null}
          {stage === "name" ? (
            <form
              className="wizard-step"
              onSubmit={(event) => {
                event.preventDefault();
                commitName();
              }}
            >
              <input
                ref={nameRef}
                className="wizard-input"
                value={inventory.title}
                maxLength={80}
                required
                enterKeyHint="next"
                autoComplete="off"
                placeholder="Texas home"
                aria-label="Inventory name"
                onChange={(event) => {
                  if (inventory.id) setInventoryTitle(inventory.id, event.target.value);
                }}
              />
              <div className="wizard-actions">
                <button type="button" className="button wizard-back" aria-label="Back" onClick={goBack}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M14.5 6.5 8 12l6.5 5.5" />
                  </svg>
                </button>
                <button type="submit" className="button wizard-continue" disabled={!titleReady}>
                  Continue
                </button>
              </div>
            </form>
          ) : null}
          {stage === "country" ? (
            <div className="wizard-step">
              <select
                className="wizard-input"
                value={inventory.addressRegion}
                required
                aria-label="Country"
                onChange={(event) => {
                  setError("");
                  if (!inventory.id) return;
                  setAddressRegion(inventory.id, event.target.value);
                  if (event.target.value) setStage("address");
                }}
              >
                <option value="">Select a country</option>
                {ADDRESS_REGIONS.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.label}
                  </option>
                ))}
              </select>
              <div className="wizard-actions">
                <button type="button" className="button wizard-back" aria-label="Back" onClick={goBack}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M14.5 6.5 8 12l6.5 5.5" />
                  </svg>
                </button>
              </div>
            </div>
          ) : null}
          {stage === "address" ? (
            <div className="wizard-step">
              <div className="address-field">
                <input
                  ref={addressRef}
                  className="wizard-input"
                  value={inventory.homeAddress}
                  maxLength={300}
                  required
                  role="combobox"
                  aria-expanded={open}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-label="Address of insured property"
                  autoComplete="street-address"
                  enterKeyHint="done"
                  placeholder="Start typing an address"
                  onChange={(event) => {
                    setError("");
                    if (inventory.id) setHomeAddress(inventory.id, event.target.value);
                  }}
                  onFocus={() => setAddressFocus(true)}
                  onBlur={() => setAddressFocus(false)}
                />
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
              <div className="wizard-actions">
                <button type="button" className="button wizard-back" aria-label="Back" onClick={goBack}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M14.5 6.5 8 12l6.5 5.5" />
                  </svg>
                </button>
                <button type="button" className="button wizard-continue" onClick={goNext} disabled={!ready || locating}>
                  {locating ? "Checking" : "Next"}
                </button>
              </div>
            </div>
          ) : null}
          {stage === "ready" ? (
            <div className="wizard-actions">
              <button type="button" className="button wizard-back" aria-label="Back" onClick={goBack}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14.5 6.5 8 12l6.5 5.5" />
                </svg>
              </button>
              <button type="button" className="button wizard-continue" onClick={() => setStep("scan")}>
                Begin scan
              </button>
            </div>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          </div>
        </div>
      ) : inventory.place ? (
        <Recorder
          autoStart={!adding}
          focusIds={adding ? focusIds : undefined}
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
