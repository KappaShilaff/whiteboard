import assert from 'node:assert/strict';
import test from 'node:test';
import { ExtensionIdentifier } from '../../platform/extensions/common/extensions.js';
import { reviewWorkspaceLanguageEvent, rewriteReviewActivationEvents } from './reviewWorkspaceLanguageActivation.js';

const extension = (id: string) => ({ identifier: new ExtensionIdentifier(id) });

test('rust-analyzer waits for the review checkout instead of the first Rust model', () => {
	const events = rewriteReviewActivationEvents(extension('rust-lang.rust-analyzer'), [
		'workspaceContains:Cargo.toml',
		'onLanguage:rust',
		'onCommand:rust-analyzer.analyzerStatus',
	]);
	assert.deepEqual(events, [
		'workspaceContains:Cargo.toml',
		'onCommand:rust-analyzer.analyzerStatus',
		reviewWorkspaceLanguageEvent('rust'),
	]);
});

test('the extension id matches case-insensitively, like the extension host', () => {
	assert.ok(rewriteReviewActivationEvents(extension('Rust-Lang.Rust-Analyzer'), ['onLanguage:rust']).includes(reviewWorkspaceLanguageEvent('rust')));
});

test('other language extensions keep their activation events', () => {
	const events = ['onLanguage:python', 'workspaceContains:pyproject.toml'];
	assert.equal(rewriteReviewActivationEvents(extension('ms-python.python'), events), events);
});
