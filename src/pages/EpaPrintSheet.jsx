// EPA application record — the formal letterhead document (DESIGN §8). It
// intentionally does NOT use the app's design system; it's a legal record.
// Rendered as a full-screen white sheet with a screen-only Print/Close bar.

function Row({ label, value }) {
  return (
    <tr>
      <th style={{ width: '35%' }}>{label}</th>
      <td>{value || '—'}</td>
    </tr>
  )
}

export function EpaPrintSheet({ log, customer, onClose }) {
  return (
    <div className="print-sheet">
      <div className="print-bar">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="print-doc">
        <h2>Pesticide Application Record</h2>
        <div style={{ fontSize: '0.85rem' }}>Required record of application (EPA / state)</div>

        <div className="print-section">
          <h3>Applicator</h3>
          <table>
            <tbody>
              <Row label="Applicator name" value={log.applicatorName} />
              <Row label="License number" value={log.licenseNumber} />
              <Row label="Business phone" value={log.businessPhone} />
              <Row label="Mix / load site" value={log.mixSite} />
            </tbody>
          </table>
        </div>

        <div className="print-section">
          <h3>Site & Application</h3>
          <table>
            <tbody>
              <Row label="Customer" value={customer?.name} />
              <Row label="Address" value={customer?.address} />
              <Row label="Date" value={log.businessDate} />
              <Row label="Area treated (sq ft)" value={log.areaTreatedSqFt} />
              <Row label="Temperature (°F)" value={log.tempF} />
              <Row label="Wind (mph)" value={log.windMph} />
            </tbody>
          </table>
          {customer?.specialApplications && (
            <p style={{ marginTop: 8 }}>
              <strong>Special constraints:</strong> {customer.specialApplications}
            </p>
          )}
        </div>

        <div className="print-section">
          <h3>Products Applied</h3>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>EPA Reg #</th>
                <th>Target</th>
                <th>Rate</th>
                <th>Spot?</th>
              </tr>
            </thead>
            <tbody>
              {(log.products || []).map((p, i) => (
                <tr key={i}>
                  <td>{p.productName || '—'}</td>
                  <td>{p.epaRegNum || '—'}</td>
                  <td>{p.targetSite || '—'}</td>
                  <td>{p.applicationRate || '—'}</td>
                  <td>{p.isSpotTreatment ? `Yes (${p.spotAreaSqFt || '?'} sqft)` : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: 24, fontSize: '0.85rem' }}>
          Applicator signature: _______________________________ Date: ______________
        </p>
      </div>
    </div>
  )
}
