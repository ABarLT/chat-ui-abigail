<script lang="ts">
	import "../styles/main.css";
	import { onDestroy } from "svelte";
	import { goto, invalidate } from "$app/navigation";
	import { base } from "$app/paths";
	import { page } from "$app/stores";
	import { browser } from "$app/environment";
	import { env as envPublic } from "$env/dynamic/public";
	import { error } from "$lib/stores/errors";
	import { createSettingsStore } from "$lib/stores/settings";
	import { shareConversation } from "$lib/shareConversation";
	import { UrlDependency } from "$lib/types/UrlDependency";
	import Toast from "$lib/components/Toast.svelte";
	import NavMenu from "$lib/components/NavMenu.svelte";
	import MobileNav from "$lib/components/MobileNav.svelte";
	import titleUpdate from "$lib/stores/titleUpdate";
	import DisclaimerModal from "$lib/components/DisclaimerModal.svelte";
	import ExpandNavigation from "$lib/components/ExpandNavigation.svelte";
	import { PUBLIC_APP_DISCLAIMER } from "$env/static/public";
	// import { get } from "svelte/store";
	// import { documentParsingError } from "$lib/stores/errors";

	import { documentParsingError } from "./store";
	// import { setDocumentParsingError } from "./eventhandler";

	import { tick } from "svelte";

	export let data;
	let isNavOpen = false;
	let isNavCollapsed = false;

	let errorToastTimeout: ReturnType<typeof setTimeout>;
	let currentError: string | null;
	// let currentDocumentParsingError: string | null;

	// documentParsingError.subscribe((value) => {
	// 	currentDocumentParsingError = value;
	// });

	// $:// currentDocumentParsingError = $documentParsingError;
	let currentDocumentParsingError: string | null;

	let documentParsingErrorToastTimeout: ReturnType<typeof setTimeout>;

	async function onError() {
		console.log("onError");
		// If a new different error comes, wait for the current error to hide first
		if (
			$error &&
			currentError &&
			$error !== currentError //||
			// ($documentParsingError &&
			// 	currentDocumentParsingError &&
			// 	currentDocumentParsingError !== $documentParsingError)
		) {
			console.log("promise section of onerror");
			clearTimeout(errorToastTimeout);
			currentError = null;
			// currentDocumentParsingError = null;
			await new Promise((resolve) => setTimeout(resolve, 5000));
		}
		console.log("setting error in on error");
		currentError = $error; //|| currentDocumentParsingError;
		// currentDocumentParsingError = $documentParsingError;
		errorToastTimeout = setTimeout(() => {
			$error = null;
			currentError = null;
			// $documentParsingError = null;
			// currentDocumentParsingError = null;
			// documentParsingError.set(null);
		}, 3000);
	}

	async function onDocumentParsingError() {
		console.log("in onDocumentParsingError");
		// currentDocumentParsingError = "SETTING document parsing error";
		currentDocumentParsingError = $documentParsingError;
		clearTimeout(documentParsingErrorToastTimeout);
		await tick();
		documentParsingErrorToastTimeout = setTimeout(() => {
			documentParsingError.set(null);
			currentDocumentParsingError = null;
		}, 3000);
	}

	// $: if ($error) {
	// 	onError();
	// }

	// $: if ($documentParsingError !== get(documentParsingError)) {
	// 	onError();
	// }
	$: currentDocumentParsingError = $documentParsingError;

	async function deleteConversation(id: string) {
		try {
			const res = await fetch(`${base}/conversation/${id}`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
			});
			if (!res.ok) {
				$error = "Error while deleting conversation, try again.";
				return;
			}
			if ($page.params.id !== id) {
				await invalidate(UrlDependency.ConversationList);
			} else {
				await goto(`${base}/`, { invalidateAll: true });
			}
		} catch (err) {
			console.error(err);
			$error = String(err);
		}
	}

	async function editConversationTitle(id: string, title: string) {
		try {
			const res = await fetch(`${base}/conversation/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title }),
			});
			if (!res.ok) {
				$error = "Error while editing title, try again.";
				return;
			}
			await invalidate(UrlDependency.ConversationList);
		} catch (err) {
			console.error(err);
			$error = String(err);
		}
	}

	onDestroy(() => {
		clearTimeout(errorToastTimeout);
		clearTimeout(documentParsingErrorToastTimeout);
	});

	$: if ($error) {
		console.log("$error");
		onError();
	}
	$: if ($documentParsingError) {
		console.log("$documentParsingError");
		onDocumentParsingError();
	}

	$: if ($titleUpdate) {
		const convIdx = data.conversations.findIndex(({ id }) => id === $titleUpdate?.convId);
		if (convIdx != -1) {
			data.conversations[convIdx].title = $titleUpdate?.title ?? data.conversations[convIdx].title;
		}
		data.conversations = [...data.conversations];
		$titleUpdate = null;
	}

	const settings = createSettingsStore(data.settings);

	$: if (browser && $page.url.searchParams.has("model")) {
		if ($settings.activeModel === $page.url.searchParams.get("model")) {
			goto(`${base}/?`);
		}
		settings.instantSet({
			activeModel: $page.url.searchParams.get("model") ?? $settings.activeModel,
		});
	}

	$: mobileNavTitle = ["/models", "/assistants", "/privacy"].includes($page.route.id ?? "")
		? ""
		: data.conversations.find((conv) => conv.id === $page.params.id)?.title;

	// $: if (currentDocumentParsingError) {
	// 	console.log("Detected currentDocumentParsingError:", currentDocumentParsingError);
	// 	onError();
	// }
	// $: {
	// 	console.log(`the current documentParsingError is ${$documentParsingError}`);
	// }
	// $: {
	// 	console.log("testing onDocumentParsingError");
	// 	onDocumentParsingError();
	// 	// console.log(`COUNT is ${$count}`);
	// 	// documentParsingError.set("SETTING DOC PARSER");
	// 	// console.log(`AND NOW is ${$documentParsingError}`);
	// 	// currentDocumentParsingError = "SETTING DOC PARSER";
	// }

	// $: if ($count) {
	// 	console.log("count triggered if count not null");
	// 	// console.log(`COUNT DOC ERROR is ${$documentParsingError}`);

	// 	// currentDocumentParsingError = $documentParsingError;
	// 	console.log("testing onDocumentParsingError");
	// 	onDocumentParsingError();
	// }
</script>

<svelte:head>
	<title>{envPublic.PUBLIC_APP_NAME}</title>
	<meta name="description" content="The first open source alternative to ChatGPT. 💪" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:site" content="@huggingface" />

	{#if !$page.url.pathname.includes("/assistant/") && $page.route.id !== "/assistants" && !$page.url.pathname.includes("/models/")}
		<meta property="og:title" content={envPublic.PUBLIC_APP_NAME} />
		<meta property="og:type" content="website" />
		<meta property="og:url" content="{envPublic.PUBLIC_ORIGIN || $page.url.origin}{base}" />
		<meta
			property="og:image"
			content="{envPublic.PUBLIC_ORIGIN ||
				$page.url.origin}{base}/{envPublic.PUBLIC_APP_ASSETS}/thumbnail.png"
		/>
		<meta property="og:description" content={envPublic.PUBLIC_APP_DESCRIPTION} />
	{/if}
	<link
		rel="icon"
		href="{envPublic.PUBLIC_ORIGIN ||
			$page.url.origin}{base}/{envPublic.PUBLIC_APP_ASSETS}/favicon.ico"
		sizes="32x32"
	/>
	<link
		rel="icon"
		href="{envPublic.PUBLIC_ORIGIN ||
			$page.url.origin}{base}/{envPublic.PUBLIC_APP_ASSETS}/icon.svg"
		type="image/svg+xml"
	/>
	<link
		rel="apple-touch-icon"
		href="{envPublic.PUBLIC_ORIGIN ||
			$page.url.origin}{base}/{envPublic.PUBLIC_APP_ASSETS}/apple-touch-icon.png"
	/>

	{#if envPublic.PUBLIC_PLAUSIBLE_SCRIPT_URL && envPublic.PUBLIC_ORIGIN}
		<script
			defer
			data-domain={new URL(envPublic.PUBLIC_ORIGIN).hostname}
			src={envPublic.PUBLIC_PLAUSIBLE_SCRIPT_URL}
		></script>
	{/if}

	{#if envPublic.PUBLIC_APPLE_APP_ID}
		<meta name="apple-itunes-app" content={`app-id=${envPublic.PUBLIC_APPLE_APP_ID}`} />
	{/if}
</svelte:head>

{#if (!$settings.ethicsModalAccepted || !data.user) && $page.url.pathname !== `${base}/privacy` && PUBLIC_APP_DISCLAIMER === "1"}
	<DisclaimerModal />
{/if}

<ExpandNavigation
	isCollapsed={isNavCollapsed}
	on:click={() => (isNavCollapsed = !isNavCollapsed)}
	classNames="{!isNavCollapsed ? 'left-[280px]' : 'left-0'} *:transition-transform"
/>
<div
	class="grid h-full w-screen grid-cols-1 grid-rows-[auto,1fr] overflow-hidden text-smd {!isNavCollapsed
		? 'md:grid-cols-[280px,1fr]'
		: 'md:grid-cols-[0px,1fr]'} transition-[300ms] [transition-property:grid-template-columns] dark:text-gray-300 md:grid-rows-[1fr]"
>
	<MobileNav isOpen={isNavOpen} on:toggle={(ev) => (isNavOpen = ev.detail)} title={mobileNavTitle}>
		<NavMenu
			conversations={data.conversations}
			user={data.user}
			canLogin={data.user === undefined && data.loginEnabled}
			on:shareConversation={(ev) => shareConversation(ev.detail.id, ev.detail.title)}
			on:deleteConversation={(ev) => deleteConversation(ev.detail)}
			on:editConversationTitle={(ev) => editConversationTitle(ev.detail.id, ev.detail.title)}
		/>
	</MobileNav>
	<nav
		class="grid max-h-screen grid-cols-1 grid-rows-[auto,1fr,auto] overflow-hidden *:w-[280px] max-md:hidden"
	>
		<NavMenu
			conversations={data.conversations}
			user={data.user}
			canLogin={data.user === undefined && data.loginEnabled}
			on:shareConversation={(ev) => shareConversation(ev.detail.id, ev.detail.title)}
			on:deleteConversation={(ev) => deleteConversation(ev.detail)}
			on:editConversationTitle={(ev) => editConversationTitle(ev.detail.id, ev.detail.title)}
		/>
	</nav>
	{#if currentError}
		<Toast message={currentError} />
	{/if}
	{#key $documentParsingError}
	{#if currentDocumentParsingError}
		<!-- <Toast message={currentDocumentParsingError || ""} /> -->
		<Toast message={currentDocumentParsingError || ""} />
	{/if}
	{/key}

	<!-- <h1>The count is: {$count}</h1>
	<button on:click={() => setCount($count)}>Increment</button> -->
	<!-- <h1>The docError is: {$documentParsingError}</h1>
	<button on:click={() => setDocumentParsingError("Here")}>Increment</button> -->

	<slot />
</div>
