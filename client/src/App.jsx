// client/src/App.jsx
import React from "react";
import { Switch, Route } from "wouter";
import PlaceOrder from "./pages/home.jsx";
import StaffDashboard from "./pages/staff.jsx";
import TokenStatus from "./pages/status.jsx";
import ApprovedOrders from "./pages/approved.jsx";

// export default function App() {
//   return (
//     <Switch>
//       <Route path="/">
//         <PlaceOrder />
//       </Route>

//       <Route path="/staff">
//         <StaffDashboard />
//       </Route>

//       <Route path="/mytoken">
//         <TokenStatus />
//       </Route>
//       <Route path="/approved">
//   <ApprovedOrders />
// </Route>


//       <Route>
//         <div>404 Page Not Found</div>
//       </Route>
//     </Switch>
//   );
// }

export default function App() {
  return (
    <Switch>
      {/* Redirect root path to staff login */}
      <Route path="/">
        <Redirect to="/staff" />
      </Route>

      {/* Staff Dashboard */}
      <Route path="/staff" component={StaffDashboard} />

      {/* If using a separate login page */}
      <Route path="/login" component={StaffLoginPage} />

      {/* Catch-all route */}
      <Route>
        <Redirect to="/staff" />
      </Route>
    </Switch>
  );
}
