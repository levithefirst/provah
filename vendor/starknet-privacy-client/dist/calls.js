/** Map a starknet.js {@link Call} to the strk20 (snake_case) wire shape (`calldata` always present). */
export function toStrk20Call(call) {
    return {
        contract_address: String(call.contractAddress),
        entry_point: call.entrypoint,
        calldata: (call.calldata ?? []),
    };
}
/** Map a strk20 (snake_case) call back to a starknet.js {@link Call}. */
export function toStarknetCall(call) {
    return {
        contractAddress: call.contract_address,
        entrypoint: call.entry_point,
        calldata: call.calldata,
    };
}
//# sourceMappingURL=calls.js.map