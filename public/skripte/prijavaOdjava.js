$(document).ready(() => {
  $("#prijavaOdjavaGumb").click(() => {
    let idIzbraneStranke = $("#seznamStrank").val();
    if(idIzbraneStranke != null) {
      window.location = idIzbraneStranke ? "/prijavaOdjava/" + idIzbraneStranke : "/prijavaOdjava/brezStranke";
    } else if(window.location.pathname == "/") {
      window.location = idIzbraneStranke ? "/prijavaOdjava/" + idIzbraneStranke : "/prijavaOdjava/brezStranke";
    } else {
      alert("Za prijavo je potrebno izbrati stranko!");
    }
  });
});
