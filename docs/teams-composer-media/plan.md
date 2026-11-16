# Teams composer: code block, images, files

Goal: the web Teams composer matches the WPF one (`NoisWorkday/UI/TeamsComposer*.cs`) for code blocks, images and file attachments.

## Phase 1 - code block (done)
- Toolbar button `formatBlock pre`; pressing it inside a block goes back to a paragraph. `buildBody` already keeps `<pre>`.
- Not ported: the WPF language header and copy button (`TeamsCompose.CodeBlockMarker`, `codeBlockEditor-<guid>` item ids, highlight.js spans).

## Phase 2 - images
- Server: `TeamsChatClient.uploadImage(channelId, image)` = POST `https://as-api.asm.skype.com/v1/objects` with `{ type: 'pish/image', permissions: { <channelId>: ['read'] }, filename }`, then PUT `.../objects/<id>/content/imgpsh` (see `TeamsChatClient.UploadImageAsync`). Limits: 10 images, 10 MB each, 20 MB total, PNG/JPEG/GIF, display side 1000 (`TeamsCompose.ImageProblem`, `DisplaySize`).
- Core: `TeamsDraft` gains `images`; `buildBody` writes `<img itemtype="http://schema.skype.com/AMSImage" src="<ams>/<id>/views/imgo" id="<id>" itemscope alt="image">` and keeps the ids of images an edit already had (`TeamsChat.AmsObjectIds`).
- Routes: reply, post and edit accept `images` (base64) with a raised body limit, like the Claude prompt route.
- Client: paste / pick / drop adds a thumbnail with a remove button; the image sits in the text where the caret was.
- Needs a live Teams check: the upload endpoints and the permissions shape are only known from the C# app.

## Phase 3 - files
- Server: the Teams sniffer must also keep the SharePoint token and the OneDrive host (`TeamsSession` has neither today; C# `TeamsWebSniffer`). Upload with `TeamsChatClient.Files.cs`: folder by id, PUT content, `createLink`, then `filesJson` on the message. Not in an edit; max files and size from `TeamsFiles`.
- Client: attach button, list under the text with remove buttons.
- Needs a live Teams check, and a re-sniff to get the new tokens.
