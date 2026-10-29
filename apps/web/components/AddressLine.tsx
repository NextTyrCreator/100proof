export function AddressLine({ address, within }: { address: string; within: boolean | null }) {
  const checked = within === true;
  const farther = within === false;

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
