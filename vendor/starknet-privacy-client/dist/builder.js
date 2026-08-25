import { num } from "starknet";
import { toStrk20Call } from "./calls.js";
const toFelt = (value) => num.toHex(num.toBigInt(value));
/**
 * The fluent operation builder behind {@link PrivacyClient.build}. Each method appends a
 * {@link Strk20Action}; `submit`/`simulate` hand the accumulated actions to `client.submit`.
 *
 * Invoke call builders receive `${openNoteIds[N]}` / `${poolAddress}` placeholders the wallet
 * substitutes at proving time. `openNoteIds` is sized to the open notes created *so far*, so open
 * notes must be created before the `invoke` / `invokeWithComputation` / shadow account `invoke` that
 * references them — `createOpenNote` after an invoke throws.
 */
class PrivacyBuilderImpl {
    userAddress;
    submitActions;
    resolveAddresses;
    actions = [];
    openNoteCount = 0;
    invoked = false;
    constructor(userAddress, submitActions, resolveAddresses) {
        this.userAddress = userAddress;
        this.submitActions = submitActions;
        this.resolveAddresses = resolveAddresses;
    }
    with(token) {
        return new PrivacyTokenBuilderImpl(this, toFelt(token));
    }
    shadowAccounts(dappName) {
        return new ShadowAccountsBuilderImpl(this, dappName, this.resolveAddresses);
    }
    invoke(callBuilder) {
        this.invoked = true;
        const details = callBuilder(this.invokeArgs());
        return this.append({
            type: "invoke",
            contract: String(details.contractAddress),
            calldata: (details.calldata ?? []),
        });
    }
    invokeWithComputation(callBuilder) {
        this.invoked = true;
        const details = callBuilder(this.invokeArgs());
        return this.append({
            type: "compute_and_invoke",
            contract: details.contractAddress,
            compute_calldata: details.computeCalldata,
            invoke_calldata: details.invokeCalldata,
        });
    }
    submit() {
        return this.submitActions(this.actions);
    }
    simulate() {
        return this.submitActions(this.actions, { simulate: true });
    }
    /** Append an action and return the builder for chaining. Used by the sub-builders. */
    append(action) {
        this.actions.push(action);
        return this;
    }
    /** Append an open note (a transfer of `"OPEN"` to the user), enforcing open-notes-before-invoke. */
    appendOpenNote(token) {
        if (this.invoked) {
            throw new Error("PrivacyBuilder: create open notes before invoke/invokeWithComputation (an invoke's " +
                "calldata references the open notes by index)");
        }
        this.openNoteCount += 1;
        return this.append({
            type: "transfer",
            token,
            amount: "OPEN",
            recipient: toFelt(this.userAddress),
        });
    }
    /** Append an invoke-phase action (its proceeds settle into the tx's open notes). */
    appendInvokePhase(action) {
        this.invoked = true;
        return this.append(action);
    }
    invokeArgs() {
        return {
            openNoteIds: Array.from({ length: this.openNoteCount }, (_, index) => `\${openNoteIds[${index}]}`),
            poolAddress: "${poolAddress}",
        };
    }
}
/** Token-scoped operations for one token, opened by {@link PrivacyBuilderImpl.with}. */
class PrivacyTokenBuilderImpl {
    builder;
    token;
    constructor(builder, token) {
        this.builder = builder;
        this.token = token;
    }
    deposit({ amount }) {
        return this.builder.append({ type: "deposit", token: this.token, amount: toFelt(amount) });
    }
    withdraw(args) {
        return this.recipientAction("withdraw", args);
    }
    transfer(args) {
        return this.recipientAction("transfer", args);
    }
    recipientAction(type, { amount, recipient }) {
        return this.builder.append({
            type,
            token: this.token,
            amount: toFelt(amount),
            recipient: toFelt(recipient),
        });
    }
    createOpenNote() {
        return this.builder.appendOpenNote(this.token);
    }
}
/** The shadow account namespace for one dapp, opened by {@link PrivacyBuilderImpl.shadowAccounts}. */
class ShadowAccountsBuilderImpl {
    builder;
    dappName;
    resolveAddresses;
    constructor(builder, dappName, resolveAddresses) {
        this.builder = builder;
        this.dappName = dappName;
        this.resolveAddresses = resolveAddresses;
    }
    addresses(range) {
        return this.resolveAddresses(this.dappName, range);
    }
    invoke(nonce, { calls, collectPolicy }) {
        return this.builder.appendInvokePhase({
            type: "shadow_account_invoke",
            dapp_name: this.dappName,
            nonce: num.toHex(nonce),
            calls: calls.map(toStrk20Call),
            collect_policy: collectPolicy ?? { type: "all" },
        });
    }
}
/** Create the fluent operation builder for {@link PrivacyClient.build}. */
export function createPrivacyBuilder(userAddress, submit, resolveAddresses) {
    return new PrivacyBuilderImpl(userAddress, submit, resolveAddresses);
}
//# sourceMappingURL=builder.js.map