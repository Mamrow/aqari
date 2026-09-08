// A fixed pause. Maestro has no `wait` command and `waitForAnimationToEnd`
// only waits while the screen is *changing* — a map whose vector tiles
// haven't started painting yet is perfectly still, so that check returns
// immediately and the screenshot catches an empty basemap. There's nothing in
// the view hierarchy to assert on either: MapLibre draws tiles into a single
// native surface, so no element appears when they arrive. Hence a plain
// busy-wait; GraalJS (what runScript runs on) has no sleep.
var end = new Date().getTime() + 8000;
while (new Date().getTime() < end) {}
