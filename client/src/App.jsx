import React from "react";
import { Route, Switch } from "wouter";

import StaffDashboard from "./pages/staff.jsx";
import ApprovedOrders from "./pages/approved.jsx";
import CompletedOrders from "./pages/Completed.jsx";
import PaymentCenter from "./pages/PaymentCenter.jsx";   // ⬅ NEW
import StaffLogin from "./pages/StaffLogin";
import Kitchen from "./pages/Kitchen";

export default function App() {
  return (
    <Switch>
      {/* Login */}
      <Route path="/staff-login">
        <StaffLogin />
      </Route>

      {/* Staff Dashboard */}
      <Route path="/staff">
        <StaffDashboard />
      </Route>

      {/* Approved Orders */}
      <Route path="/approved">
        <ApprovedOrders />
      </Route>

      {/* Completed Orders */}
      <Route path="/completed">
        <CompletedOrders />
      </Route>

      {/* Payment Center */}
      <Route path="/payment">
        <PaymentCenter />
      </Route>

      {/* Kitchen */}
      <Route path="/kitchen">
        <Kitchen />
      </Route>

      {/* Default → Login */}
      <Route path="/">
        <StaffLogin />
      </Route>

      {/* 404 */}
      <Route>
        <div style={{ color: "white", padding: 20 }}>404 - Not Found</div>
      </Route>
    </Switch>
  );
}
