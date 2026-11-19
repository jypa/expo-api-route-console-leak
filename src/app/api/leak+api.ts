// `expo` reaches expo-modules-core's EventEmitter, which is a 'use client' module.
import 'expo';

export function GET() {
  return Response.json({ ok: true });
}
