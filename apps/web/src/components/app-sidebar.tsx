import { UserButton, useUser } from "@clerk/react";
import {
  BedDouble,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  Map as MapIcon,
  Plane,
  Plus,
  Route,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { CreateTripDialog } from "@/components/create-trip-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useTrips } from "@/lib/trips";

const tripSections = [
  { icon: LayoutDashboard, label: "Overview", path: "" },
  { icon: ListChecks, label: "Itinerary", path: "/itinerary" },
  { icon: Lightbulb, label: "Ideas", path: "/ideas" },
  { icon: Route, label: "Transportation", path: "/travel" },
  { icon: BedDouble, label: "Stays", path: "/stays" },
  { icon: Users, label: "People", path: "/people" },
];

function AppSidebar() {
  const trips = useTrips();
  const { tripId } = useParams();
  const location = useLocation();
  const { user } = useUser();
  const [createOpen, setCreateOpen] = useState(false);
  const [collapsedTripIds, setCollapsedTripIds] = useState<Set<string>>(() => new Set());

  function toggleTripExpanded(id: string) {
    setCollapsedTripIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-2 py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" className="h-10">
              <Link to="/trips">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <Plane className="size-4" aria-hidden="true" />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">Voyage</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">
                    Trip workspace
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === "/trips"}
                  tooltip="All trips"
                >
                  <Link to="/trips">
                    <MapIcon aria-hidden="true" />
                    <span>All trips</span>
                    {trips.data?.length ? (
                      <span className="ml-auto text-xs tabular-nums text-sidebar-foreground/55">
                        {trips.data.length}
                      </span>
                    ) : null}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Trips</SidebarGroupLabel>
          <CreateTripDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            trigger={
              <SidebarGroupAction aria-label="Create trip" title="Create trip">
                <Plus aria-hidden="true" />
              </SidebarGroupAction>
            }
          />
          <SidebarGroupContent>
            <SidebarMenu>
              {trips.isPending
                ? [0, 1, 2].map((item) => <SidebarMenuSkeleton key={item} showIcon />)
                : null}
              {trips.data?.map((trip) => {
                const active = trip.id === tripId;
                const expanded = active && !collapsedTripIds.has(trip.id);

                return (
                  <SidebarMenuItem key={trip.id}>
                    {active ? (
                      <SidebarMenuButton
                        type="button"
                        isActive
                        tooltip={trip.name}
                        aria-expanded={expanded}
                        onClick={() => toggleTripExpanded(trip.id)}
                      >
                        <Plane aria-hidden="true" />
                        <span>{trip.name}</span>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton asChild tooltip={trip.name}>
                        <Link to={`/trips/${trip.id}`}>
                          <Plane aria-hidden="true" />
                          <span>{trip.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    )}
                    {active ? (
                      <SidebarMenuAction
                        type="button"
                        aria-label={`${expanded ? "Collapse" : "Expand"} ${trip.name}`}
                        aria-expanded={expanded}
                        title={`${expanded ? "Collapse" : "Expand"} ${trip.name}`}
                        onClick={() => toggleTripExpanded(trip.id)}
                      >
                        {expanded ? (
                          <ChevronDown aria-hidden="true" />
                        ) : (
                          <ChevronRight aria-hidden="true" />
                        )}
                      </SidebarMenuAction>
                    ) : null}
                    {expanded ? (
                      <SidebarMenuSub>
                        {tripSections.map((section) => {
                          const href = `/trips/${trip.id}${section.path}`;
                          const sectionActive =
                            section.path === ""
                              ? location.pathname === href
                              : location.pathname.startsWith(href);

                          return (
                            <SidebarMenuSubItem key={section.label}>
                              <SidebarMenuSubButton asChild isActive={sectionActive}>
                                <Link to={href}>
                                  <section.icon aria-hidden="true" />
                                  <span>{section.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex h-10 items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <UserButton />
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-sm font-medium">
                  {user?.fullName || user?.firstName || "Account"}
                </p>
                <p className="truncate text-xs text-sidebar-foreground/60">
                  {user?.primaryEmailAddress?.emailAddress}
                </p>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export { AppSidebar };
