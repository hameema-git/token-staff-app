import React from "react";

import { Route, Switch } from "wouter";
import StaffDashboard from "./pages/staff.jsx";
import ApprovedOrders from "./pages/approved.jsx";

export default function App() {
  return (
    <Switch>
      {/* Default path shows staff login/dashboard */}
      <Route path="/">
        <StaffDashboard />
      </Route>

      <Route path="/approved">
        <ApprovedOrders />
      </Route>

      {/* Optional alias */}
      <Route path="/staff">
        <StaffDashboard />
      </Route>

      <Route>
        <div>404 - Not Found</div>
      </Route>
    </Switch>
  );
}
