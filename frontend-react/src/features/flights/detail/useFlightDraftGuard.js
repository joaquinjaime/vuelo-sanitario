import { useEffect } from "react";
import { useBlocker } from "react-router-dom";
import { DRAFT_WARNING } from "../components/PlanningPanel";

const hasDraft = () => Boolean(document.querySelector("#tab-panel [data-flight-draft]"));

export function useFlightDraftGuard() {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    currentLocation.pathname !== nextLocation.pathname && hasDraft());

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(DRAFT_WARNING)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    const warn = (event) => {
      if (!hasDraft()) return;
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
}
