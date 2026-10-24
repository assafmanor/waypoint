-- ADR-0242 §3: a list's link is a Summary share scoped to one event category.
ALTER TABLE "TripShare" ADD COLUMN "scopeCategory" "EventCategory";
