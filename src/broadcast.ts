type BroadcastEvent =
  | { type: "MENU_UPDATED"; payload: unknown }
  | { type: "PRINTERS_UPDATED"; payload: unknown }
  | { type: "USERS_UPDATED"; payload: unknown };

interface ConnectionSocket {
  readyState: number;
  send: (message: string) => void;
  on: (event: string, listener: () => void) => void;
}

const connections = new Set<ConnectionSocket>();

export const registerSocket = (socket: ConnectionSocket) => {
  connections.add(socket);

  socket.on("close", () => {
    connections.delete(socket);
  });
};

export const broadcast = (event: BroadcastEvent) => {
  const message = JSON.stringify(event);

  for (const socket of connections) {
    if (socket.readyState === 1) {
      socket.send(message);
    }
  }
};
