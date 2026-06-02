console.log(base_url);

window.onload = init;

// dom variables defined in init ---------------------------
// records dom nodes
const dom = {};
let desktop_breakpoint;



let fly_path=[];
const fly_path_columns = 12;

let polyline_length = 0;
let svg_box_height = 100;

// animation timing variables ---------------
let buzz_mode = false;
let buzz_pos = 0;

let full_duration = 10 * 1000;
let ms_per_unit = 15;
let init_fly_position = 0;

let path_length_lookup;

// flight token: lets a new flight cancel any older animation loop
let buzz_token = 0;

// link reveal state ------------------------
// the <a> element for each nav link, in path order
let nav_links = [];
// the fly's path-y value at which each link should be revealed
let nav_reveal_thresholds = [];

let full_distance = 1;
let flight = {
  current: {
    position: 0,
  },
  start: {
    position: 0,
    time: 0,
  },
  end: {
    position: 1,
  },
  duration: 1,
  distance: 1,
};

// ---------------------------------


function init() {
  // main container element nodes
  dom.main = document.querySelector("main");
  dom.nav = dom.main.querySelector("nav");
  dom.article = dom.main.querySelector("article");

  // fly path nodes
  dom.fly = document.querySelector("#fly");
  dom.flypath = document.querySelector("#fly-path");
  dom.polyline = document.querySelector("#fly-path polyline");

  // page links in nav
  dom.nav_item_segments = Array.from(
    document.querySelectorAll(".nav-link-wrapper")
  );

  // page size handling
  window.addEventListener("resize", handle_resize);
  handle_resize();

  // event listener for nav
  document.querySelector("#toggle-nav").addEventListener("click", toggle_menu);

  desktop_breakpoint=window.matchMedia('(min-width:1000px)');
  desktop_breakpoint.addEventListener('change',handle_breakpoint_change);

  if(dom.main.dataset.fly_loaded!=='true'){
      // build the path once the webfont is ready, so the title widths
      // we size each leg against are measured accurately
      const start = () => {
        // fly path setup — build the path for the current breakpoint
        fly_path = generate_fly_path({ is_desktop: desktop_breakpoint.matches });

        render_fly_path("start");
        buzz(false);

        // play the intro flight on load (desktop and mobile)
        setTimeout(() => {
          buzz();
        }, 200);
      };

      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(start);
      } else {
        start();
      }

      dom.main.dataset.fly_loaded="true";
  }


  // type
  optical_align_headers();
  dom.main.classList.add("mounted");
}

function optical_align_headers() {
  let headers = document.querySelectorAll("h2");
  let match_list = [`“`, `”`, `‘`, `’`, "(", ")"];

  for (let header of headers) {
    if (match_list.includes(header.innerText[0])) {
      header.innerHTML = header.innerHTML.replace(
        header.innerText[0],
        `<span class="optical-align">${header.innerText[0]}</span>`
      );
    }
  }
}

function toggle_menu() {
  let old_state = dom.main.dataset.menu_open === "true";
  let open = !old_state;
  dom.main.dataset.menu_open = open;
  dom.nav.setAttribute("aria-hidden", !open);
  dom.article.setAttribute("aria-hidden", open);

  if (open) {
    // hide every link and take the timing away from CSS so the
    // reveal is driven by the fly's position instead
    prime_link_reveal();
    // always restart the flight from the top of the path on open
    flight.current.position = init_fly_position;
    flight.end.position = 1;
    buzz();
  } else {
    flight.end.position = 1;
    hide_links();
  }
}

/**
 * Prepares the nav links for a fly-driven reveal.
 * Overrides the CSS transition-delay (inline styles win) so each link
 * fades in the instant the fly passes it, with no fixed clock stagger.
 */
function prime_link_reveal() {
  for (const link of nav_links) {
    if (!link) continue;
    link.style.transition = "opacity 0.25s ease";
    link.style.transitionDelay = "0s";
    link.style.opacity = "0";
  }
}

/**
 * Hides all nav links (used when the menu closes).
 */
function hide_links() {
  for (const link of nav_links) {
    if (!link) continue;
    link.style.opacity = "0";
  }
}

/**
 * Reveals each link whose path position the fly has already passed.
 * current_y is the fly's current y in the SVG viewBox coordinate space.
 */
function update_link_reveal(current_y) {
  for (let k = 0; k < nav_links.length; k++) {
    const link = nav_links[k];
    if (!link) continue;
    const threshold = nav_reveal_thresholds[k];
    if (threshold == null) continue;
    link.style.opacity = current_y >= threshold ? "1" : "0";
  }
}

function handle_resize() {
  // TK fly path handling

  // scrollbar width logic
  // https://stackoverflow.com/a/5774874
  const scrollbar_width =
    window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.setProperty(
    "--scrollbar-width",
    scrollbar_width + "px"
  );
}

function handle_breakpoint_change(e){
  const is_desktop=e.matches;
  // need to reset fly_path to be appropriate to breakpoint
  // if desktop, need to animate flight
  // if mobile, need to set position to zero
}

/**
 * Measures the intrinsic (single-line) pixel width of each nav title.
 * Temporarily takes each link out of flow so the grid can't constrain it,
 * then restores the original inline styles.
 */
function measure_title_widths() {
  return dom.nav_item_segments.map((seg) => {
    const a = seg.querySelector("a");
    if (!a) return 0;

    const prev_position = a.style.position;
    const prev_white_space = a.style.whiteSpace;
    const prev_left = a.style.left;

    a.style.position = "absolute";
    a.style.whiteSpace = "nowrap";
    a.style.left = "-9999px";

    const width = a.getBoundingClientRect().width;

    a.style.position = prev_position;
    a.style.whiteSpace = prev_white_space;
    a.style.left = prev_left;

    return width;
  });
}

/**
 * Generate path segments needed based on presets and height of the page.
 *
 * Each leg's length is randomized. Legs that carry a nav title are always
 * made at least as long as that title's text width (so the text fits inside
 * the leg); other legs use a small base minimum.
 */
function generate_fly_path({is_desktop = true} = {}) {
  const new_fly_path=[];

  // measure dimensions
  const page = {
    w: document.querySelector('nav').offsetWidth,
    h: document.documentElement.scrollHeight,
  };

  // width of one grid column, in px
  const col_px = page.w / fly_path_columns;

  // calculate vertical distance of smallest movement increment
  const row_height = page.w / fly_path_columns / 4;

  // per-title minimum leg length (in whole columns): at least twice the
  // title's text width. ceil guarantees leg width >= 2 * title width.
  const title_widths = measure_title_widths();
  const title_min_cols = title_widths.map((w) =>
    Math.min(fly_path_columns, Math.max(1, Math.ceil((2 * w) / col_px + 0.25)))
  );
  const n_titles = title_min_cols.length;

  // smallest leg for the extra (title-less) legs that pad out the height
  const base_min = is_desktop ? 2 : 3;

  // at minimum, line should go far enough to underly all the links
  const min_segments = dom.nav_item_segments.length + 1;

  // calculate the maximum vertical distance (in segment increments) that can be added based on available height
  const max_y = Math.ceil(page.h / row_height);

  // keep every nav title visible within the window height. a leg of Δx columns
  // drops Δx * (col_px / 4) in height, so cap the combined drop of the
  // title-bearing legs to the visible window.
  const page_margin =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--page-margin")
    ) || 20;
  const available_h = Math.max(0, window.innerHeight - page_margin * 2);
  const max_title_cols = (available_h * 4) / col_px;
  // suffix sums of the title minimums, to reserve room for the later titles
  const remaining_title_min = new Array(n_titles + 1).fill(0);
  for (let t = n_titles - 1; t >= 0; t--) {
    remaining_title_min[t] = remaining_title_min[t + 1] + title_min_cols[t];
  }
  let used_title_cols = 0;

  // pass column data to the page
  dom.nav.style.setProperty("--cols", fly_path_columns);

  // start in the top right corner with the menu button
  new_fly_path.push({ x: fly_path_columns, y: 0 });

  // sets the alternating direction of the segment: forwards=right, !forwards=left.
  let forwards = false;

  // “for” loop end logic. Checks if path satisfies min length conditions.
  const keep_generating = (i) => {
    return (i < 1) || (new_fly_path.at(-1).y < max_y) || (i < min_segments);
  };

  // loop to generate each point
  for (let i = 0; keep_generating(i); i++) {
    // check where the path is currently
    const cur = new_fly_path.at(-1).x;

    // minimum columns this leg must span:
    // title legs must be longer than their text; others use the base minimum
    const need = i < n_titles ? title_min_cols[i] : base_min;

    // room available before hitting either wall
    const room_left = cur;
    const room_right = fly_path_columns - cur;

    // preferred direction, but flip to the side with more room if the
    // preferred side can't hold this leg
    let dir = forwards ? 1 : -1;
    let room = dir < 0 ? room_left : room_right;
    const other = dir < 0 ? room_right : room_left;
    if (room < need && other > room) {
      dir = -dir;
      room = other;
    }

    // this leg's minimum, capped by the wall it heads toward
    const lo = Math.min(need, room);

    // upper bound for the random length: the wall, and for title legs also
    // the remaining window-height budget (so all titles stay on screen)
    let hi = room;
    if (i < n_titles) {
      const budget = max_title_cols - used_title_cols - remaining_title_min[i + 1];
      hi = Math.min(room, Math.max(lo, Math.floor(budget)));
    }

    // randomize the leg length between its minimum and that upper bound
    const span =
      hi > lo ? lo + Math.floor(Math.random() * (hi - lo + 1)) : lo;

    // never produce a zero-length leg
    const dx = Math.max(1, span);
    const nx = cur + dir * dx;

    // track how much height the title legs have used so far
    if (i < n_titles) used_title_cols += dx;

    // y advances by the horizontal distance travelled (same as before)
    new_fly_path.push({ x: nx, y: new_fly_path.at(-1).y + Math.abs(nx - cur) });

    // alternate based on the direction actually taken
    forwards = dir < 0;
  }

  return new_fly_path;
}

/**
 * Using fly path segments,
 * render SVG polyline and set initial values
 */
function render_fly_path(placement = 'start') {

  // calculate column width as a percentage of x
  const col = 100 / fly_path_columns;
  // derive row height from column width.
  const row = col / 4;

  // generate svg polyline points from provided fly points
  const polyline_points = fly_path
    .map((a, i) => {
      let x = a.x;
      let y = a.y;

      // on the last point, if it ends on an edge, leave a little space
      // so that the fly stays on screen
      if (i == fly_path.length - 1) {
        if (x == fly_path_columns) {
          // ends on right edge
          x -= 0.4;
          y -= 0.1;
        } else if (x == 0) {
          // ends on left edge
          x += 0.4;
          y -= 0.1;
        }
      }

      return `${x * col},${y * row}`;
    })
    .join(" ");

  // calculate svg height from last point position.
  svg_box_height = fly_path.at(-1).y * row;

  // set viewbox accordingly
  dom.flypath.setAttribute("viewBox", `0 0 100 ${svg_box_height}`);

  // set path of polyline
  dom.polyline.setAttribute("points", polyline_points);

  // keep the trace line the same on-screen thickness on every device.
  // non-scaling-stroke makes stroke-width (and the dash pattern) true pixel
  // values regardless of how the SVG viewBox is scaled, so the narrow mobile
  // viewBox renders the line at the same weight as the wide desktop one.
  const trace_px = 1.6;
  dom.polyline.style.vectorEffect = "non-scaling-stroke";
  dom.polyline.style.strokeWidth = trace_px + "px";
  dom.polyline.style.strokeDasharray = (trace_px * 6.7).toFixed(2) + "px";
  dom.polyline.style.strokeDashoffset = (trace_px * 12).toFixed(2) + "px";

  // read the path length (uses microlibrary for performance)
  path_length_lookup=getPathLengthLookup(dom.polyline);
  polyline_length = path_length_lookup.totalLength;

  // calculate the flight duration from distance (this may change)
  full_duration = ms_per_unit * polyline_length;

  // position is a percentage, so we have to divide the absolute value by total length
  // to set the contant initial position.
  init_fly_position = 10 / polyline_length;
  flight.current.position = placement == 'start' ? init_fly_position : 1;
  flight.end.position = 1;

  // record line length in dom
  dom.flypath.style.setProperty("--l", polyline_length);

  // record aspect ratio, which gets used by the CSS mask
  document
    .querySelector("#fly-path-wrapper")
    .style.setProperty("--h-w-ratio", svg_box_height / 100);

  // reset reveal bookkeeping for this freshly rendered path
  nav_links = [];
  nav_reveal_thresholds = [];

  // this adds stacked elements so that the height of the nav element matches the total path
  // it also positions the page links with the path segments
  for (let i = 1; i < fly_path.length; i++) {
    // finds nav link for this segment if it exists
    const item = dom.nav_item_segments[i - 1];
    // function handles item positioning/generation
    const segment = generate_segment(
      fly_path[i - 1],
      fly_path[i],
      item
    );
    segment.style.setProperty("--i", i);

    // for real nav links, record the <a> and the path-y at which the
    // fly reaches it (the bottom of the segment === fly_path[i].y)
    if (item) {
      nav_links[i - 1] = item.querySelector("a");
      nav_reveal_thresholds[i - 1] = fly_path[i].y * row;
    }
  }
}

/**
 * Generates dom element which corresponds with/matches the position of
 * a segment in the fly path line
 */
function generate_segment(
  start = { x: 0, y: 0 },
  end = { x: 0, y: 0 },
  existing_node
) {
  // sort x values to use for box height/position
  const x_sorted_ascending = [start.x, end.x].sort((a, b) => a - b);

  // if node passed in (for nav link), use that, otherwise create div
  const div = existing_node ? existing_node : document.createElement("div");
  // set positioning and props
  div.style.setProperty("--start-x", x_sorted_ascending[0] + 1);
  div.style.setProperty("--end-x", x_sorted_ascending[1] + 1);
  div.style.setProperty("--start-y", start.y + 1);
  div.style.setProperty("--end-y", end.y + 1);
  div.classList.add("segment");
  div.dataset.direction = start.x < end.x ? "right" : "left";

  // add to dom if new
  if (!existing_node) dom.nav.appendChild(div);

  return div;
}


/**
 * Sets fly path to starting state
 * and begins animation if desired
 */
function buzz(v = true) {
  // if v=true, animates
  // else, just sets position once
  buzz_mode = v;

  // recording initial state and time
  flight.start.time = performance.now();
  flight.start.position = flight.current.position;
  flight.distance = flight.end.position - flight.start.position;
  flight.duration = (flight.distance / full_distance) * full_duration;

  // claim a fresh token so any previously running loop bows out
  const token = ++buzz_token;

  // go!
  requestAnimationFrame(() => position_fly(token));
}

/**
 * Self-looping animation frame for fly buzz
 */
function position_fly(token) {
  // if a newer flight has started, stop this loop
  if (token !== buzz_token) return;

  // calculate progress based on time from start
  const now = performance.now();
  const elapsed = now - flight.start.time;
  if(flight.duration && flight.distance){
    flight.current.position =
      flight.start.position + (elapsed / flight.duration) * flight.distance;
  };

  // read point position for the current progress
  const path_point = path_length_lookup.getPointAtLength(
    polyline_length * flight.current.position
  );
  // check a nearby second point so we can get the tangent
  const tangent_comparison = path_length_lookup.getPointAtLength(
    polyline_length * (flight.current.position - 0.001)
  );

  // determine the angle to position fly correctly
  const tangent_angle =
    Math.atan2(
      tangent_comparison.y - path_point.y,
      tangent_comparison.x - path_point.x
    ) -
    Math.PI * -0.5;

  // set fly position and from measured path values
  dom.fly.style.setProperty("--buzz-x-absolute", path_point.x / 100);
  dom.fly.style.setProperty("--buzz-y-absolute", path_point.y / 100);

  // sets mask size to show portion of path for this point
  dom.flypath.style.setProperty(
    "--buzz",
    path_point.y / 100
  );

  // use the tangent to set the angle of the fly
  if (flight.current.position > 0)
    dom.fly.style.setProperty("--buzz-direction", tangent_angle + "rad");

  // reveal nav links as the fly passes them (only while the menu is open)
  if (dom.main.dataset.menu_open === "true") {
    update_link_reveal(path_point.y);
  }

  // calls next frame when animation is still going.
  if (buzz_mode && elapsed < flight.duration) {
    requestAnimationFrame(() => position_fly(token));
  }else{
    buzz_mode=false;
  }
}