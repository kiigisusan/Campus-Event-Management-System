# CEMS documentation

| Document                                     | For                        | What's in it                                                          |
| -------------------------------------------- | -------------------------- | --------------------------------------------------------------------- |
| [Installation guide](installation-guide.md)  | Anyone running the project | Requirements, Docker setup, running the frontend, demo accounts, troubleshooting |
| [User manual](user-manual.md)                | Students, organizers, admins | How to use each part of the app, role by role                        |
| [Architecture](architecture.md)              | Developers, markers        | System diagram, backend layers, booking/payment and check-in flows, status lifecycles, security |
| [Database schema](database-schema.md)        | Developers, markers        | Entity-relationship diagram, every table and column, constraints and indexes |

The API itself is documented with Swagger at `http://localhost:4000/api/docs` while the
backend is running. Backend scripts and test setup are in [backend/README.md](../backend/README.md).

Diagrams are written in [Mermaid](https://mermaid.js.org/), which GitHub renders directly.
