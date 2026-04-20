import argparse
import asyncio
import json
import signal
import sys

import websockets


async def pipe_messages(source, target):
    try:
        async for message in source:
            await target.send(message)
    except websockets.ConnectionClosed:
        pass


async def handle_client(client, target_ws):
    try:
        async with websockets.connect(target_ws, max_size=None, open_timeout=15) as upstream:
            to_upstream = asyncio.create_task(pipe_messages(client, upstream))
            to_client = asyncio.create_task(pipe_messages(upstream, client))
            done, pending = await asyncio.wait(
                [to_upstream, to_client],
                return_when=asyncio.FIRST_EXCEPTION,
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            for task in done:
                exc = task.exception()
                if exc and not isinstance(exc, websockets.ConnectionClosed):
                    raise exc
    finally:
        await client.close()


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target-ws", required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()

    stop_event = asyncio.Event()

    def request_stop(*_args):
        stop_event.set()

    for sig_name in ("SIGINT", "SIGTERM"):
        sig = getattr(signal, sig_name, None)
        if sig is not None:
            signal.signal(sig, request_stop)

    server = await websockets.serve(
        lambda websocket: handle_client(websocket, args.target_ws),
        args.host,
        args.port,
        max_size=None,
    )
    socket = server.sockets[0]
    host, port = socket.getsockname()[:2]
    sys.stdout.write(json.dumps({"wsUrl": f"ws://{host}:{port}/"}) + "\n")
    sys.stdout.flush()

    try:
        await stop_event.wait()
    finally:
        server.close()
        await server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
