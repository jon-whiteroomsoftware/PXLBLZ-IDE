// Pattern: Real World Lights
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
// Credit: "Real World Lights" by ZRanger1 - https://patterns.electromage.com/pattern/MRbBTYfptRQ2zesqv
// License: MIT License.
//
// Thirteen selectable presets evoke candlelight, lamps, fluorescent tubes, and other physical sources.
// Runs on: 1D strips, rings, and strands.
// Controls: Light Type — Selects the real-world light source to emulate.

/*
 Real World Lights

 Emulates the general color and look, if not the exact spectral characteristics
 of some interesting real-world light sources, selectable by UI slider.  The lights
 are, in order:

   0 - Candlelight*
   1 - Warm white incandescent
   2 - Soft white incandescent
   3 - Cool white incandescent
   4 - Uranium glass fluorescence* (https://en.wikipedia.org/wiki/Uranium_glass)
   5 - High pressure sodium lamp
   6 - Mercury Vapor lamp
   7 - Sodium vapor lamp
   8 - Warm fluorescent tube
   9 - Cool fluorescent tube
  10 - LED grow light (vegetative phase)
  11 - Ultraviolet (black light) tube
  12 - Cherenkov radiation* ("normal" light if you have a nuclear reactor handy)

  (* - lights with movement effects/flicker)

   Tested on APA102 and RGB WS2812b. Some colors may
   need adjustment on RGBW LEDs, depending on
   the particular shade of the 'W' LED.

 MIT License
 Take this code and use it to make cool things!

 ZRanger1 01/22/2022
*/

// light index definitions
  candle = 0
  warm_white = 1
  soft_white = 2
  cool_white = 3
  uranium_glass = 4
  hp_sodium = 5
  mercury = 6
  sodium_vapor = 7
  warm_fl = 8
  cool_fl = 9
  fl_grow = 10
  ultraviolet = 11
  cherenkov = 12

// arrays for light parameters
var nLights = 13;
var preLight = array(nLights);
var renderLight = array(nLights);

// global color values for animation control and use in render
var speed,t1,t2,t3,t4;
var r,g,b,h,s,v;

///////
// Tables of functions for the light sources
//////

function preCoolWhite(delta) { ctToRGB(66); }
function preWarmWhite(delta) { ctToRGB(29); }
function preSoftWhite(delta) { ctToRGB(40); }
function preGrowLight(delta) { ; }
function preWarmFluorescent(delta) { r=1;g=0.8;b=0.8; }
function preCoolFluorescent(delta) { r=.831;g=0.922;b=1; }
function preUltraviolet(delta) { r=0.655;g=0;b=1; }
function preMercury(delta) { r=0.55;g=1;b=.58; }
function preUraniumGlass(delta) { speed = 0.85;h = 0.2673;s = 1;v = 1; }
function preSodiumVapor(delta) { h = 0.08;s=0.902; }
function preCandleLight(delta) { speed = 0.4;h = 0.05;s=0.98;v=1; }
function preHighPressureSodium(delta) { h = 0.04;s=0.969; }
function preCherenkov(delta) { speed = 0.85;h = 0.591;s = 0.997;v = 1; }
function renderRgb(index) { rgb(r,g,b); }
function renderHsv(index) { hsv(h,s,1); }

preLight[cool_white] = preCoolWhite;   // Cool white incandescent
renderLight[cool_white] = renderRgb;

preLight[warm_white] = preWarmWhite;   // Warm White incandescent
renderLight[warm_white] = renderRgb;

preLight[soft_white] = preSoftWhite;   // Soft white incandescent
renderLight[soft_white] = renderRgb;

preLight[fl_grow] = preGrowLight;   // Fluorescent grow light
renderLight[fl_grow] = renderGrowLight;

preLight[warm_fl] = preWarmFluorescent;   // Warm fluorescent tube
renderLight[warm_fl] = renderRgb;

preLight[cool_fl] = preCoolFluorescent;   // Cool fluorescent tube
renderLight[cool_fl] = renderRgb;

preLight[ultraviolet] = preUltraviolet;  // black light tube
renderLight[ultraviolet] = renderRgb;

preLight[mercury] = preMercury;   // mercury vapor lamp
renderLight[mercury] = renderRgb;

preLight[uranium_glass] = preUraniumGlass;
renderLight[uranium_glass] = renderUraniumGlass;

preLight[sodium_vapor] = preSodiumVapor;     // sodium vapor
renderLight[sodium_vapor] = renderHsv;

preLight[candle] = preCandleLight; // candlelight
renderLight[candle] = renderCandle;

preLight[hp_sodium] = preHighPressureSodium;   // high pressure sodium
renderLight[hp_sodium] = renderHsv;

preLight[cherenkov] = preCherenkov;
renderLight[cherenkov] = renderCherenkov;

// UI controls
export var nCurrentLight = 0;
export function sliderLightType(v) {
    nCurrentLight = floor(v * (nLights - 1));
}

// smooth 1D noise (sum of sines). Returns value
// in the range -1 to 1
function noise(index) {
  var x,v;
  x = index/pixelCount;
  v =  2 * (wave((33 * x) - t1) - 0.5);
  v += 2 * (wave((45 * x) + t2) - 0.5);
  v += 2 * (wave((21 * x) + t3) - 0.5);
  v += 2 * (wave((15 * x) - t4) - 0.5);
  return v / 4;
}

// candle renderer adds a little movement
function preCandle(delta) {
  speed = 0.5;
  h = 0.05;s=0.98;
}

function renderCandle(index) {
  var v = noise(index);
  hsv(h-(0.015 * triangle(v+index/pixelCount)), s, max(0.35,v));
}

// grow light for vegetative phase plants...
function renderGrowLight(index) {
  var pct = wave(index/pixelCount*60); pct = 0.33 * pct * pct
  hsv(0.65+pct,1,1)
}

// add a little internal brightness variation for fluorescence
function renderUraniumGlass(index) {
  var v = noise(index);
  hsv(h, s, max(0.25,v));
}

// variation for radiation effects
function renderCherenkov(index) {
  var n = noise(index/3);
  hsv(h, 1, max(0.2,n));
}

// convert color temp in degrees K/100 to RGB color
function ctToRGB(ct){

    if( ct < 67 ){
        r = 1;
        g = 0.5313 * log(ct) - 1.2909;

        if( ct <= 19){
            b = 0;
        } else {
            b = 0.0223 * ct - 0.5063;
        }
    } else {
        r = 38.309 * pow(ct,-0.886);
        g = 10.771 * pow(ct,-0.588);
        b = 1;
    }

    r = clamp(r,0, 1);
    g = clamp(g,0, 1);
    b = clamp(b,0, 1);
}

export function beforeRender(delta) {

  // a few timers we can use for internal variation
  t1 = time(speed *.16);
  t2 = time(speed *.1);
  t3 = time(speed *.14);
  t4 = time(speed *.11);

  preLight[nCurrentLight](delta);
}

export function render(index) {
  renderLight[nCurrentLight](index);
}
