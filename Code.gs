function onOpen() {
  DocumentApp.getUi()
      .createMenu('Meu Editor')
      .addItem('Abrir Painel Lateral', 'showSidebar')
      .addToUi();
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
      .setTitle('Dados Dinâmicos')
      .setWidth(300);
  DocumentApp.getUi().showSidebar(html);
}

// Função chamada pelo JavaScript da Sidebar para inserir texto no cursor
function insertTextAtCursor(text) {
  var cursor = DocumentApp.getActiveDocument().getCursor();
  if (cursor) {
    // Insere onde o cursor está
    var element = cursor.insertText(text);
    if (!element) {
      DocumentApp.getUi().alert('Não foi possível inserir texto aqui.');
    }
  } else {
    // Se não houver cursor (ex: seleção), insere no final do corpo ou substitui seleção
    var selection = DocumentApp.getActiveDocument().getSelection();
    if (selection) {
      var elements = selection.getRangeElements();
      var replace = elements[0].getElement().asText();
      replace.setText(text); 
    } else {
      // Fallback: insere no final do documento
      DocumentApp.getActiveDocument().getBody().appendParagraph(text);
    }
  }
}