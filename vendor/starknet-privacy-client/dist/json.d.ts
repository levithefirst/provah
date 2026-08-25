/**
 * Stringify any value for a diagnostic message, without the serializer itself becoming the failure.
 * `JSON.stringify` throws on a `bigint`, and values reaching an error path here come from dapp
 * callers or an RPC peer — a strk20 action's `amount` is typed as a hex string but nothing stops a
 * caller passing `5n` — so bigints are cast to their decimal form. Anything JSON still cannot
 * represent (a cycle, a `toJSON` that throws) falls back to `String(value)`, so the caller's error
 * survives instead of being replaced by a `TypeError`.
 */
export declare function safeStringify(value: unknown): string;
//# sourceMappingURL=json.d.ts.map