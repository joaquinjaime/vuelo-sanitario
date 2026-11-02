import React from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Urgency } from "../flights/components/Urgency";
import { locationLabel, dt } from "../../utils/format";
import { appPath } from "../../app/navigation";

const MAX = 6;

/** Lista corta de lo que requiere atención, cada elemento con un enlace directo a su detalle. */
export function AttentionList({ title, eyebrow = "ATENCIÓN", flights, section, empty, seeAll, limit = MAX }) {
  const rows = flights.slice(0, limit);
  return (
    <Card eyebrow={eyebrow} title={title} actions={seeAll && <Link className="tertiary-link" to={seeAll}>Ver todo ({flights.length})</Link>}>
      {rows.length ? (
        <ul className="queue-list">
          {rows.map((flight) => (
            <li key={flight.id} className={flight.extremaUrgencia ? "queue-item is-urgent" : "queue-item"}>
              <div>
                <Link className="row-link" to={appPath(`${section}/${flight.id}`)}>{flight.codigo || `Vuelo ${flight.id}`}</Link>
                <span>{locationLabel(flight.origen)} → {locationLabel(flight.destino)}{flight.salida || flight.solicitada ? ` · ${dt(flight.salida || flight.solicitada)}` : ""}</span>
              </div>
              <div><Urgency flight={flight} /><StatusBadge state={flight.estado} /></div>
            </li>
          ))}
        </ul>
      ) : <p className="empty compact-empty">{empty}</p>}
    </Card>
  );
}
