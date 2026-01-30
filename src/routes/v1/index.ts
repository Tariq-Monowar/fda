import { FastifyInstance } from "fastify";
import auth from "./auth/auth.routes";

import users from "./users/users.routes";
import setting from "./settings/setting.routes";

import subscriptionRoutes from "./subscription/subscription.routes";

import transactionRoutes from "./transactions/transactions.routes";
import stripeRoutes from "./webhooks/stripe/webhooks.routes";
import predictionsRoutes from "./predictions/predictions.routes";
import dashboardRoutes from "./dashboard/dashboard.routes";

async function routesV1(fastify: FastifyInstance) {
  const moduleRoutes = [
    { path: "/auth", route: auth },

    { path: "/users", route: users },
    { path: "/setting", route: setting },
    { path: "/predictions", route: predictionsRoutes },
    { path: "/subscription", route: subscriptionRoutes },
    { path: "/transactions", route: transactionRoutes },
    { path: "/webhooks/stripe", route: stripeRoutes },
    { path: "/dashboard", route: dashboardRoutes },
  ];

  moduleRoutes.forEach(({ path, route }) => {
    fastify.register(route, { prefix: path });
  });
}

export default routesV1;
