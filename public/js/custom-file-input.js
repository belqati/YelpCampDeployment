// custom-file-input modification + css for restyling: based on the tut by Osvaldas Valutis https://tympanus.net/codrops/2015/09/15/styling-customizing-file-inputs-smart-way/
// his original script also accounts for multifile uploads with a counter

"use strict";

;( function ( document, window, index )
{
  let inputs = document.querySelectorAll( ".inputfile" );
  Array.prototype.forEach.call( inputs, function( input )
  {
    let label  = input.nextElementSibling;

    input.addEventListener( "change", function( e )
    {
      let fileName = e.target.value.split( "\\" ).pop();
      label.querySelector( "span" ).innerHTML = fileName;
    });

    // Firefox bug fix
    input.addEventListener( "focus", function(){ input.classList.add( "has-focus" ); });
    input.addEventListener( "blur", function(){ input.classList.remove( "has-focus" ); });
  });
}( document, window, 0 ));