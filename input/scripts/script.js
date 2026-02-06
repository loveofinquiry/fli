console.log(base_url);

window.onload = init;

// dom variables defined in init ---------------------------
// records dom nodes
const dom = {};
let desktop_breakpoint;



let fly_path=[];
const fly_path_columns = 12;
const use_flight_memory=true;

const stored_flight_y=access_flight_memory()?.at(-1)?.y ?? 0

let polyline_length = 0;
let svg_box_height = 100;

// animation timing variables ---------------
let buzz_mode = false;
let buzz_pos = 0;

// 10 second starting duration, set by distance in render_fly_path
let full_duration = 10 * 1000;
let ms_per_unit = 15;
let init_fly_position = 0;

let path_length_lookup;

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
      const is_desktop=desktop_breakpoint.matches;

      // fly path setup
      fly_path=generate_fly_path({is_desktop});


      render_fly_path(stored_flight_y && is_desktop ? 'end' : 'start');

      if(stored_flight_y==0 && desktop_breakpoint.matches){
        flight.end.position=1;
          setTimeout(() => {
          buzz();
        }, 200);
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

  // flight.end.position = open ? init_fly_position : 1;

  if(!desktop_breakpoint.matches){

    flight.end.position = open ? 0.99 : init_fly_position;
    // animate if open, just flip if not
    setTimeout(()=>{
      buzz(open);
    },open?150:0);
    
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
    ( window.innerWidth>450 ? scrollbar_width: 0) + "px"
  );
}

function handle_breakpoint_change(e){
  document.querySelectorAll('.segment:not(.nav-link-wrapper)').forEach((segment)=>{
    segment.remove();
  })

  requestAnimationFrame(()=>{
    const is_desktop=e.matches;
    // need to reset fly_path to be appropriate to breakpoint

    fly_path=generate_fly_path({is_desktop});

    if(fly_path.length>0){
      // set the fly to its start point regardless
      render_fly_path('start');
    }

    // if desktop, animate it
    if(is_desktop){
      buzz();
    }
  })
  
}

/**
 * Generate path segments needed based on presets and height of the page
 */
function generate_fly_path({is_desktop = true} = {}) {
  const stored_fly_path=is_desktop ? access_flight_memory(): [];

  const new_fly_path=[];

  // measure dimensions
  const page = {
    w: dom.nav.offsetWidth,
    h: dom.main.offsetHeight
    // h: document.documentElement.scrollHeight,
  };

  console.log('page',page)

  // calculate vertical distance of smallest movement increment
  const row_height = page.w / fly_path_columns / 4;

  // at minimum, line should go far enough to underly all the links
  const min_segments = dom.nav_item_segments.length + 1;

  // calculate the maximum vertical distance (in segment increments) that can be added based on available height
  const max_y = Math.ceil(page.h / row_height);

  // pass column data to the page
  dom.nav.style.setProperty("--cols", fly_path_columns);

  // start in the top right corner with the menu button
  new_fly_path.push({ x: fly_path_columns, y: 0 });

  // minimum columns for a segment to traverse. 12 (full distance) on mobile.
  const min_distance = is_desktop ? 4 : 12;

  // sets the alternating direction of the segment: forwards=right, !forwards=left.
  let forwards = false;

  // “for” loop end logic. Checks if path satisfies min length conditions.
  const keep_generating = (i) => {
    return is_desktop?(i < 1) || (new_fly_path.at(-1).y < max_y) || (i < min_segments):i<min_segments;
  };

  // loop to generate each point
  for (let i = 0; keep_generating(i); i++) {
    const stored_point=stored_fly_path[i+1];
    if(stored_point){
      console.log('stored_point',stored_point)
      save_to_new_path({...stored_point});
      continue;
    }


    // check where the path is currently
    const crosshair = { ...new_fly_path.at(-1) };

    // check how many columns are to the left of the current
    const space_before = forwards
      ? []
      : Math.max(0, crosshair.x - min_distance + 1);

    // check how many columns are to the right of the current
    const space_after = forwards
      ? Math.max(0, fly_path_columns + 1 - (crosshair.x + min_distance))
      : [];

    const choices_for_x = [];

    // record all the possible choices on the left
    for (let i = 0; i < space_before; i++)
      choices_for_x.push(crosshair.x - (min_distance + i));
    // do the same for the right
    for (let i = 0; i < space_after; i++)
      choices_for_x.push(crosshair.x + (min_distance + i));

    // pick a new x at random from possible
    const x = choices_for_x[Math.floor(Math.random() * choices_for_x.length)];

    console.log({choices_for_x,x,crosshair,min_distance,space_before,space_after})

    // set the y and create the point object
    const point = { x, y: crosshair.y + Math.abs(crosshair.x - x) };

    
    save_to_new_path(point);
    

    function save_to_new_path(point){
      if(typeof point.x == 'number' && typeof point.y == 'number'){
        // add it to the points array
        new_fly_path.push(point);

        // alternate the flying direction
        forwards = !forwards;
      }
    }
  }

  console.log('new_fly_path',new_fly_path)


  if(is_desktop&&new_fly_path.length>stored_fly_path.length){
    console.log('recording to memory...')
    access_flight_memory('set',new_fly_path);
  }


  return new_fly_path;
}


function access_flight_memory(action="get",data = []){
  if(action=='set'){
    localStorage.setItem("flight_in_memory",JSON.stringify(data));
  }

  const flight_memory=JSON.parse(localStorage.getItem('flight_in_memory'));

  return use_flight_memory?(flight_memory || []):[];
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

  // read the path length (uses microlibrary for performance)
  path_length_lookup=getPathLengthLookup(dom.polyline);
  polyline_length = path_length_lookup.totalLength;

  // calculate the flight duration from distance (this may change)
  full_duration = desktop_breakpoint.matches?ms_per_unit * polyline_length:fly_path.length*150;

  // position is a percentage, so we have to divide the absolute value by total length
  // to set the contant initial position.
  // init_fly_position = desktop_breakpoint.matches ? 10 / polyline_length : 0.006;
  init_fly_position = (desktop_breakpoint.matches?10:15) / polyline_length;
  flight.current.position = placement == 'start' ? init_fly_position : 1;
  flight.end.position = flight.current.position;

  // record line length in dom
  dom.flypath.style.setProperty("--l", polyline_length);

  // record aspect ratio, which gets used by the CSS mask
  document
    .querySelector("#fly-path-wrapper")
    .style.setProperty("--h-w-ratio", svg_box_height / 100);

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
  }

  buzz(false);
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
  
  // go!
  requestAnimationFrame(position_fly);
}

/**
 * Self-looping animation frame for fly buzz
 */
function position_fly() {
  // calculate progress based on time from start
  const now = performance.now();
  const elapsed = buzz_mode ? now - flight.start.time: flight.duration;
  // if(!buzz_mode) console.log('elapsed',elapsed);
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
    polyline_length * (Math.min(1,flight.current.position) - 0.001)
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

  // calls next frame when animation is still going.
  if (buzz_mode && elapsed < flight.duration) {
    requestAnimationFrame(position_fly);
  }else{
    buzz_mode=false;
  }
}
