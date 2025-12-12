import React from "react";
import { Route, Switch } from "wouter";

import StaffDashboard from "./pages/staff.jsx";
import ApprovedOrders from "./pages/approved.jsx";
import CompletedOrders from "./pages/Completed.jsx"; // ⬅ added
import StaffLogin from "./pages/StaffLogin";
import Kitchen from "./pages/Kitchen";

export default function App() {
  return (
    <Switch>
      {/* Login page */}
      <Route path="/staff-login">
        <StaffLogin />
      </Route>

      {/* Staff dashboard */}
      <Route path="/staff">
        <StaffDashboard />
      </Route>

      {/* Approved orders page */}
      <Route path="/approved">
        <ApprovedOrders />
      </Route>

      {/* Completed orders page */}
      <Route path="/completed">
        <CompletedOrders /> 
      </Route>

      {/* Kitchen page */}
      <Route path="/kitchen">
        <Kitchen />
      </Route>

      {/* Default route → redirect to login */}
      <Route path="/">
        <StaffLogin />
      </Route>

      {/* 404 fallback */}
      <Route>
        <div style={{ color: "white", padding: 20 }}>404 - Not Found</div>
      </Route>
    </Switch>
  );
}
