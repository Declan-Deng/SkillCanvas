# Ordered 16-dimensional clarification emoji

Mode: built-in image_gen edit. Target: skillcanvas-16d-clarification-emoji.png.

Use case: precise-object-edit
Input image: the supplied robot and 4x4 tile board PNG is the edit target.
Primary request: change ONLY the checked-state arrangement of the board's sixteen tiles. Keep all sixteen cells in exactly four columns and four rows. Green checked cells must be sequential row-major: fill the first six cells starting at the top-left, reading left to right then down.
Exact mandatory arrangement, rows counted top to bottom and columns left to right:
Row 1: green tile with dark forest check; green tile with dark forest check; green tile with dark forest check; green tile with dark forest check.
Row 2: green tile with dark forest check; green tile with dark forest check; blank ivory tile; blank ivory tile.
Row 3: blank ivory tile; blank ivory tile; blank ivory tile; blank ivory tile.
Row 4: blank ivory tile; blank ivory tile; blank ivory tile; blank ivory tile.
Exactly SIX green checked tiles, and exactly TEN blank ivory tiles. Remove the old random checks and green fills in row 3 and row 4.
Invariants: preserve the friendly mint robot, face, pose, hands, 4x4 board geometry, tile sizes and spacing, orange cursor position and click accents, lighting, satin-clay 3D rendering, perspective, colors, proportions and framing as closely as possible. Do not redesign or add objects.
Transparency: output a genuine transparent PNG with a real alpha channel; all surrounding empty space completely transparent. Do not render a checkerboard, black, white, or any colored backdrop. No floor or ground shadow.
No text, letters, numbers or logos.

## Targeted alpha correction

Use case: background-extraction.
Edit target: supplied 3D robot with 4x4 tile board image.
Remove the ENTIRE gray-and-white checkerboard background and replace it with genuine transparent pixels in a PNG alpha channel. This is a background removal task. Return a real transparent cutout, NOT a picture of transparency. Every empty area around the robot and board must have alpha 0. Preserve the exact robot, board, six checkmarks, orange cursor, colors, pose, 3D materials, lighting, object edges, framing and composition.
The board is already correct and MUST NOT CHANGE: first row all four tiles green checked; second row only first two tiles green checked; the last ten cells blank ivory; exactly 4 rows by 4 columns.
No backdrop, no checkerboard, no white rectangle, no black rectangle, no floor. Do not add anything or redraw the objects. Only remove background and preserve clean anti-aliased cutout edges. Output transparent PNG with real alpha.

## Fresh generation after reference-based alpha failures

Both reference-based outputs had baked checkerboards (hasAlpha: no). Fresh reconstruction approved to prioritize correct grid and true transparency.

Use case: stylized-concept
Create a premium 3D emoji PNG with a GENUINELY TRANSPARENT BACKGROUND and real alpha channel. Every pixel outside the isolated objects must be transparent. No checkerboard backdrop, no floor or ground shadow.
Subject: friendly mint-green robot at the LEFT, leaning beside and guiding a large compact ivory square 4x4 tile board at the RIGHT. Robot has a rounded rectangular dark forest-green face-screen with glowing smiling crescent eyes and a small smile, ivory face rim, two slim antennae with mint sphere tips, small mint round ear pieces, one mint hand holding top edge of board and one pointing hand beside left side. Soft rounded satin clay with subtle glossy highlights.
The board has EXACTLY SIXTEEN separate rounded square tiles in exactly FOUR COLUMNS and FOUR ROWS. The SIX green checked tiles MUST be sequential in reading order, with this EXACT arrangement:
TOP ROW: mint-green CHECK, mint-green CHECK, mint-green CHECK, mint-green CHECK.
SECOND ROW: mint-green CHECK, mint-green CHECK, BLANK IVORY, BLANK IVORY.
THIRD ROW: BLANK IVORY, BLANK IVORY, BLANK IVORY, BLANK IVORY.
BOTTOM ROW: BLANK IVORY, BLANK IVORY, BLANK IVORY, BLANK IVORY.
All checks are bold dark forest-green ticks. All ten blank tiles are completely unmarked ivory. No checks in bottom two rows. No green blank tiles.
An orange selection-arrow cursor overlays the right-center blank tile area with three small orange click accent strokes. Keep all six green checks fully readable. The square board is near frontal with subtle 3D perspective. Robot peeks over its upper left edge; entire silhouette compact and centered inside square image, all objects fully visible with transparent margin.
Palette: mint green, ivory, dark forest green, orange only for cursor. Soft studio upper-left lighting. Premium clean satin clay emoji consistent with polished software landing-page illustrations.
No words, letters, numbers, logos, watermark, random decoration, dirt or backdrop. Output genuine alpha transparent PNG, not an image of a transparency pattern.
