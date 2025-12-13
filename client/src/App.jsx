import React from "react";
import { Route, Switch } from "wouter";

import StaffDashboard from "./pages/staff.jsx";
import ApprovedOrders from "./pages/approved.jsx";
import CompletedOrders from "./pages/Completed.jsx";
import PaymentCenter from "./pages/PaymentCenter.jsx";
import StaffLogin from "./pages/StaffLogin";
import Kitchen from "./pages/Kitchen";
import StaffPlaceOrder from "./pages/StaffPlaceOrder";

// ✅ NEW OWNER SUMMARY PAGE
import OwnerSummary from "./pages/OwnerSummary.jsx";

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

      {/* Owner Summary (Shop Owner Only) */}
      <Route path="/owner-summary">
        <OwnerSummary />
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
      <Route path="/staff-place-order">
  <StaffPlaceOrder />
</Route>

      {/* Default → Login */}
      <Route path="/">
        <StaffLogin />
      </Route>

      {/* 404 */}
      <Route>
        <div style={{ color: "white", padding: 20 }}>
          404 - Not Found
        </div>
      </Route>
    </Switch>
  );
}
