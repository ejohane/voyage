import { Plane } from "lucide-react";
import { Link } from "react-router-dom";

function Brand() {
  return (
    <Link
      className="inline-flex items-center gap-2 rounded-md text-sm font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      to="/"
      aria-label="Voyage home"
    >
      <span className="grid size-8 place-items-center rounded-md bg-foreground text-background">
        <Plane className="size-4" aria-hidden="true" />
      </span>
      Voyage
    </Link>
  );
}

export { Brand };
