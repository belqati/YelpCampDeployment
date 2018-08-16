// use package dotenv for hiding and loading persisting environment variables in .env file
// .gitignore file stores .env and /node_modules, which gitHub then ignores on upload/push
// N.B.: geocoder api uses two keys, one which appears publicly in show.ejs url--thus the PUBLIC VERSION MUST ADJUST RESTRICTIONS VIA GOOGLE DEV DASHBOARD
require("dotenv").config();

let express = require("express");
let app = express();
let bodyParser = require("body-parser");
let mongoose = require("mongoose");
let passport = require("passport");
let LocalStrategy = require("passport-local");
let methodOverride = require("method-override");
// for flashing messages to user during interaction
let flash = require("connect-flash");

// load module models
let Campground = require("./models/campground");
let Comment = require("./models/comment");
let User = require("./models/user");

// load module routes
let commentRoutes = require("./routes/comments");
let campgroundRoutes = require("./routes/campgrounds");
let indexRoutes = require("./routes/index");
let userRoutes = require("./routes/users");
let searchResults = require("./routes/search");

// config server and DB
mongoose.connect("mongodb://localhost/yelpCamp");
app.use(bodyParser.urlencoded({extended: true}));
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));
app.use(methodOverride("_method"));
// flash is used with session, and config before it
app.use(flash());

// load "moment", tracks when users add stuff
app.locals.moment = require("moment");

// config session and passport
app.use(require("express-session")({
  secret: process.env.SESSIONSECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// implement local strategy, authenticate via passport-mongoose enabled User model
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// app.use() passes the function as middleware for all routes: if logged in req.user = obj w/ username and _id, else = undefined
app.use(function(req, res, next) {
  // access user id everywhere
  res.locals.currentUser = req.user;
  // show flash message everywhere
  res.locals.error = req.flash("error");
  res.locals.success = req.flash("success");
  next();
});

// use loaded routes, refactored to DRY up each route
app.use("/", indexRoutes);
app.use("/campgrounds", campgroundRoutes);
app.use("/campgrounds/:id/comments", commentRoutes);
app.use("/users", userRoutes);
app.use("/searchResults", searchResults);

app.listen(3000, function() {
  console.log("YelpCamp Server has started!");
});