'use strict';

import gulp from 'gulp';
import shell from 'gulp-shell';
import rimraf from 'rimraf';
import run from 'run-sequence';
import plumber from 'gulp-plumber';
import concat from 'gulp-concat';
import sass from 'gulp-sass';
import minifyCss from 'gulp-minify-css';
import nodemon from 'gulp-nodemon';
import webpack from 'webpack';
import webpackConfig from './webpack.config';

const paths = {
  serverDest  : './src/server/index.js',
  clientDest  : './app',
  sassSrc     : ['./src/sass/**/*.scss']
};

// Building the code to be used for production
gulp.task('build', cb => {
  run('clean-client', 'webpack', 'sass', cb);
});

/**
 * Development tasks
 */

gulp.task('default', cb => {
  run('build-dev', cb);
});

gulp.task('build-dev', cb => {
  run('server', 'build', 'watch-webpack', 'watch-sass', cb);
});

gulp.task('clean-client', cb => {
  rimraf(paths.clientDest, cb);
});

gulp.task('sass', cb => {
  gulp.src(paths.sassSrc)
  .pipe(plumber())
  .pipe(sass())
  .pipe(concat('style.css'))
  .pipe(minifyCss())
  .pipe(gulp.dest(paths.clientDest))
  cb();
});

gulp.task('webpack', cb => {
  webpack(webpackConfig, (err, stats) => {
    if(err) {
      console.log(err);
      process.exit(1);
    }

    cb();
  });
});

gulp.task('server', () => {
  nodemon({
    script: paths.serverDest,
    ext: 'js',
    execMap: {
      js: "node"
    },
    watch: ['./src/server']
  }).on('restart', () => {
    console.log('*** NODEMON RESTARTED ***');
  });
});

/**
 * Watch tasks
 */

gulp.task('watch-webpack', cb => {
  gulp.watch(['src/client/**/*.*'], ['webpack']);
  cb();
});

gulp.task('watch-sass', cb => {
  gulp.watch(['src/sass/**/*.*'], ['sass']);
  cb();
});