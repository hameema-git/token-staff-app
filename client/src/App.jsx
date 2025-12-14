import React from "react";
import { Route, Switch } from "wouter";
import { useShop } from "./context/ShopContext";
import useApplyTheme from "./hooks/useApplyTheme";

import StaffDashboard from "./pages/staff.jsx";
import ApprovedOrders from "./pages/approved.jsx";
import CompletedOrders from "./pages/Completed.jsx";
import PaymentCenter from "./pages/PaymentCenter.jsx";
import StaffLogin from "./pages/StaffLogin";
import Kitchen from "./pages/Kitchen";
import StaffPlaceOrder from "./pages/StaffPlaceOrder";
import MenuManage from "./pages/MenuManage";
import OwnerSummary from "./pages/OwnerSummary.jsx";

export default function App() {
  const { shop } = useShop();

  // 🔥 THIS LINE MAKES FIREBASE COLORS WORK
  useApplyTheme(shop?.theme);

  return (
    <Switch>
      <Route path="/staff-login">
        <StaffLogin />
      </Route>

      <Route path="/staff">
        <StaffDashboard />
      </Route>

      <Route path="/owner-summary">
        <OwnerSummary />
      </Route>

      <Route path="/approved">
        <ApprovedOrders />
      </Route>

      <Route path="/completed">
        <CompletedOrders />
      </Route>

      <Route path="/payment">
        <PaymentCenter />
      </Route>

      <Route path="/kitchen">
        <Kitchen />
      </Route>

      <Route path="/staff-place-order">
        <StaffPlaceOrder />
      </Route>

      <Route path="/menu-manage">
        <MenuManage />
      </Route>

      <Route path="/">
        <StaffLogin />
      </Route>

      <Route>
        <div style={{ color: "white", padding: 20 }}>
          404 - Not Found
        </div>
      </Route>
    </Switch>
  );
}
