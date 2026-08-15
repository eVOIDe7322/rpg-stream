import { readFile } from 'node:fs/promises';
import { createServer as createHttpsServer } from 'node:https';
import { createApplication } from './main/create-application.js';

const { app, config, database, shutdown: shutdownApplication } =
    await createApplication();

if (
    Boolean(config.tlsCertificateFile) !== Boolean(config.tlsKeyFile)
) {
    throw new Error(
        'TLS_CERT_FILE e TLS_KEY_FILE devem ser configurados juntos.',
    );
}

const secure = Boolean(config.tlsCertificateFile && config.tlsKeyFile);
const server = secure
    ? createHttpsServer(
          {
              cert: await readFile(config.tlsCertificateFile!),
              key: await readFile(config.tlsKeyFile!),
          },
          app,
      ).listen(config.port, onListening)
    : app.listen(config.port, onListening);

function onListening(): void {
    console.log(
        `🚀 Servidor rodando em ${secure ? 'https' : 'http'}://${config.publicHost}:${config.port}`,
    );
}

server.timeout = 0;
server.requestTimeout = 0;
server.headersTimeout = 0;
server.keepAliveTimeout = 90_000;

let shuttingDown = false;

const shutdown = () => {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    void shutdownApplication().finally(() => {
        server.close(() => {
            void database.close().finally(() => process.exit(0));
        });
        server.closeIdleConnections();
        setTimeout(() => server.closeAllConnections(), 3_000).unref();
    });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
