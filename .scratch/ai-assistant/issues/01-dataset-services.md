Status: done

# Dataset services out of the HTTP layer

`createDatasetHandlers` (`server.ts`) builds the dataset's operations inside the route closure. Move their construction to `datasets/services.ts` (`openServices`), and have the handlers take the services. No behaviour changes; the existing tests pass unchanged.
