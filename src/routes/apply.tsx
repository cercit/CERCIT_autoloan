import { createFileRoute, redirect } from "@tanstack/react-router";

// The old one-page apply form saved nothing. Every "Apply" and "Start your
// journey" link now opens the real customer application; this keeps old links
// and bookmarks working.
export const Route = createFileRoute("/apply")({
  beforeLoad: () => {
    throw redirect({ to: "/login", search: { as: "customer" } });
  },
});
