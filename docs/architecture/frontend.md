# Frontend architecture

The maintained frontend is the React/TypeScript application in `desktop/`. Despite the historical directory name, the exported portfolio scope is the web application; native packaging sources are not included.

## Structure

- `src/app` composes providers, the router, query behavior, and route guards.
- `src/pages` owns route-level composition.
- `src/features` groups API bindings, state, validation, and UI by business capability.
- `src/widgets` contains application-shell composition.
- `src/shared` contains reusable UI, utilities, configuration, and infrastructure.

TanStack Query manages server state and invalidation. React Hook Form and Zod drive forms and client-side validation. Zustand is used for focused local state rather than as a replacement for the server cache. React Router v6 handles navigation and protected routes. ECharts powers analytics displays, and Konva/React Konva provides the interactive inspection surface.

Permission-aware navigation improves usability, but the backend remains the authorization boundary. Loading, error, empty, and responsive states are represented across the feature modules and shared components.
