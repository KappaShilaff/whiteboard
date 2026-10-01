import { ExtensionIdentifier, type IExtensionDescription } from "../../platform/extensions/common/extensions.js";

/**
 * Language extensions that read the workspace once, when they activate, and never again.
 *
 * rust-analyzer captures its workspace in `activate` and ignores folders added later. In a
 * Review window the review's checkout becomes a workspace folder only after its first Rust
 * model exists, and that model fires the implicit `onLanguage:rust` the extension gets from
 * its `rust` language contribution. The extension then wakes with an empty workspace and never
 * starts its server. These extensions activate on {@link reviewWorkspaceLanguageEvent} instead,
 * which Review fires once the checkout is a folder; `workspaceContains:` still applies, because
 * the extension host evaluates it against folders it already has.
 */
const WORKSPACE_BOUND_LANGUAGES = new Map<string, string>([
	["rust-lang.rust-analyzer", "rust"],
]);

export function reviewWorkspaceLanguageEvent(languageId: string): string {
	return `onReviewWorkspaceLanguage:${languageId}`;
}

export function rewriteReviewActivationEvents(desc: Pick<IExtensionDescription, "identifier">, activationEvents: string[]): string[] {
	const languageId = WORKSPACE_BOUND_LANGUAGES.get(ExtensionIdentifier.toKey(desc.identifier));
	if (!languageId) return activationEvents;
	const early = `onLanguage:${languageId}`;
	return [...activationEvents.filter(event => event !== early), reviewWorkspaceLanguageEvent(languageId)];
}
