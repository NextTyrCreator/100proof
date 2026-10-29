import { ADDRESS_MATCH_MILES } from "../lib/inventory";

export function AddressLine({ address, miles }: { address: string; miles: number | null }) {
  const checked = miles != null && miles <= ADDRESS_MATCH_MILES;
  const farther = miles != null && miles > ADDRESS_MATCH_MILES;

  return (
    <div className="address-line">
      <p className={checked ? "confirm-address is-checked" : "confirm-address"}>
        {checked ? (
          <span className="place-mark" role="img" aria-label="Within 1 mile">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.4 8.2 L6.5 11.2 L12.6 4.6" />
            </svg>
          </span>
        ) : null}
        <span>{address}</span>
      </p>
      {farther ? (
        <p className="place-distance">
          Allow location and make sure this device is within 1 mile for full verification.
        </p>
      ) : null}
    </div>
  );
}
