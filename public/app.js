angular.module('docEditor', [])
    .controller('MainController', function($scope, $http, $sce, $timeout) {
        $scope.alert = {}; // Object to hold alert message and type
        $scope.tabs = [];
        $scope.activeTabId = null;
        $scope.creating = false;

        $scope.showNewDocModal = false;
        $scope.newDocName = '';
        $scope.creatingDocName = '';
        $scope.legalPieceSuggestions = [
            'Petição Inicial',
            'Contestação',
            'Réplica',
            'Recurso de Apelação',
            'Agravo de Instrumento',
            'Embargos de Declaração',
            'Mandato / Procuração',
            'Alegações Finais',
            'Contrarrazões',
            'Impugnação ao Cumprimento de Sentença'
        ];

        // Configurações de Compartilhamento / Permissões
        $scope.sharingSettings = {
            defaultMode: 'domain',
            targetDomain: 'procuradoria.rio'
        };
        $scope.currentDocPermission = {
            mode: 'domain',
            targetDomain: 'procuradoria.rio',
            loading: false
        };
        $scope.updatingPermission = false;
        $scope.showSharingConfigModal = false;
        $scope.showAuthModal = false;
        $scope.iframeKey = Date.now();
        $scope.sharingConfigForm = {
            defaultMode: 'domain',
            targetDomain: 'procuradoria.rio'
        };

        // Funções de Autenticação / Login Google Workspace
        $scope.openAuthModal = function() {
            $scope.showAuthModal = true;
        };

        $scope.closeAuthModal = function() {
            $scope.showAuthModal = false;
        };

        $scope.refreshIframe = function() {
            $scope.iframeKey = Date.now();
            showAlert('Recarregando documento...', 'info');
        };

        $scope.openGoogleLogin = function() {
            const activeTab = $scope.getActiveTab();
            const domain = $scope.sharingSettings.targetDomain || 'procuradoria.rio';
            const targetDocUrl = activeTab && activeTab.docId 
                ? 'https://docs.google.com/document/d/' + activeTab.docId + '/edit'
                : 'https://docs.google.com';
            
            // Redireciona especificamente para login com conta do domínio da procuradoria
            const googleAuthUrl = 'https://accounts.google.com/AccountChooser?hd=' + encodeURIComponent(domain) + '&continue=' + encodeURIComponent(targetDocUrl);
            
            const width = 650, height = 700;
            const left = Math.max(0, (window.innerWidth - width) / 2 + window.screenX);
            const top = Math.max(0, (window.innerHeight - height) / 2 + window.screenY);
            
            const popup = window.open(
                googleAuthUrl,
                'GoogleAuthWindow',
                `width=${width},height=${height},top=${top},left=${left},status=no,toolbar=no,menubar=no`
            );

            showAlert('Janela de login do Google aberta. Conecte sua conta @' + domain + ' e retorne aqui.', 'info');

            // Monitora o fechamento do popup para atualizar automaticamente o iframe
            if (popup) {
                const interval = setInterval(function() {
                    try {
                        if (popup.closed) {
                            clearInterval(interval);
                            $scope.$apply(function() {
                                $scope.refreshIframe();
                                $scope.showAuthModal = false;
                                showAlert('Sessão Google sincronizada! Minuta recarregada.', 'success');
                            });
                        }
                    } catch (e) {
                        clearInterval(interval);
                    }
                }, 1000);
            }
        };

        // Carregar configurações de compartilhamento padrão
        function loadSharingSettings() {
            $http.get('/api/settings/sharing').then(
                function(response) {
                    if (response.data && response.data.success) {
                        $scope.sharingSettings.defaultMode = response.data.defaultMode || 'domain';
                        $scope.sharingSettings.targetDomain = response.data.targetDomain || 'procuradoria.rio';
                        $scope.sharingConfigForm.defaultMode = $scope.sharingSettings.defaultMode;
                        $scope.sharingConfigForm.targetDomain = $scope.sharingSettings.targetDomain;
                    }
                },
                function(error) {
                    console.warn('Erro ao carregar configurações de compartilhamento:', error);
                }
            );
        }
        loadSharingSettings();

        // Carregar permissão da minuta ativa
        $scope.fetchDocPermissions = function(docId) {
            if (!docId) return;
            $scope.currentDocPermission.loading = true;
            $http.get('/api/document/' + docId + '/permissions').then(
                function(response) {
                    if (response.data && response.data.success) {
                        $scope.currentDocPermission.mode = response.data.mode;
                        $scope.currentDocPermission.targetDomain = response.data.targetDomain || $scope.sharingSettings.targetDomain;
                    }
                },
                function(error) {
                    console.warn('Erro ao obter permissão do documento:', error);
                }
            ).finally(function() {
                $scope.currentDocPermission.loading = false;
            });
        };

        // Alterar permissão da minuta ativa
        $scope.changeActiveDocSharingMode = function(newMode) {
            const activeTab = $scope.getActiveTab();
            if (!activeTab || !activeTab.docId) {
                showAlert('Nenhum documento ativo selecionado.', 'warning');
                return;
            }

            if ($scope.updatingPermission) return;
            $scope.updatingPermission = true;

            const domain = $scope.sharingSettings.targetDomain || 'procuradoria.rio';
            $http.post('/api/document/' + activeTab.docId + '/permissions', {
                mode: newMode,
                targetDomain: domain
            }).then(
                function(response) {
                    if (response.data && response.data.success) {
                        $scope.currentDocPermission.mode = newMode;
                        const modeLabel = newMode === 'public' ? '🌐 PÚBLICO (Qualquer pessoa com o link)' : ('🏢 PRIVADO (Restrito a @' + domain + ')');
                        showAlert('Permissões da minuta "' + activeTab.title + '" atualizadas para: ' + modeLabel, 'success');
                    } else {
                        showAlert('Erro ao atualizar permissão da minuta.', 'danger');
                    }
                },
                function(error) {
                    showAlert('Erro ao comunicar com o servidor para alterar permissão.', 'danger');
                }
            ).finally(function() {
                $scope.updatingPermission = false;
            });
        };

        $scope.openSharingConfigModal = function() {
            $scope.sharingConfigForm = {
                defaultMode: $scope.sharingSettings.defaultMode,
                targetDomain: $scope.sharingSettings.targetDomain
            };
            $scope.showSharingConfigModal = true;
        };

        $scope.closeSharingConfigModal = function() {
            $scope.showSharingConfigModal = false;
        };

        $scope.saveSharingConfig = function() {
            $http.post('/api/settings/sharing', $scope.sharingConfigForm).then(
                function(response) {
                    if (response.data && response.data.success) {
                        $scope.sharingSettings.defaultMode = response.data.defaultMode;
                        $scope.sharingSettings.targetDomain = response.data.targetDomain;
                        $scope.showSharingConfigModal = false;
                        showAlert('Configurações de compartilhamento salvas com sucesso!', 'success');
                    } else {
                        showAlert('Erro ao salvar configurações de compartilhamento.', 'danger');
                    }
                },
                function(error) {
                    showAlert('Erro ao salvar configurações.', 'danger');
                }
            );
        };

        // Function to show an alert and hide it after 5 seconds
        function showAlert(message, type) {
            $scope.alert = { message, type };
            $timeout(function() {
                $scope.alert = {};
            }, 5000);
        }

        $scope.openNewDocModal = function() {
            $scope.newDocName = '';
            $scope.showNewDocModal = true;
            $timeout(function() {
                const input = document.getElementById('newDocNameInput');
                if (input) input.focus();
            }, 100);
        };

        $scope.closeNewDocModal = function() {
            $scope.showNewDocModal = false;
        };

        $scope.selectPieceSuggestion = function(suggestion) {
            $scope.newDocName = suggestion;
            const input = document.getElementById('newDocNameInput');
            if (input) input.focus();
        };

        $scope.confirmCreateDocument = function() {
            const name = ($scope.newDocName && $scope.newDocName.trim()) || 'Minuta Sem Título';
            $scope.showNewDocModal = false;
            createNewDocument(name);
        };

        function createNewDocument(docName) {
            if ($scope.creating) return;
            $scope.creating = true;
            $scope.creatingDocName = docName || 'minuta';
            $http.post('/api/document', {
                docName: docName,
                sharingMode: $scope.sharingSettings.defaultMode,
                targetDomain: $scope.sharingSettings.targetDomain
            }).then(
                function(response) {
                    if (response.data && response.data.success) {
                        const newDoc = {
                            id: response.data.document.id,
                            title: response.data.document.title,
                            docId: response.data.document.id
                        };
                        $scope.tabs.push(newDoc);
                        $scope.selectTab(newDoc.id);
                        showAlert('Minuta "' + newDoc.title + '" criada com sucesso!', 'success');
                    } else {
                        showAlert('Erro ao criar nova minuta.', 'danger');
                    }
                },
                function(error) {
                    showAlert('Erro ao criar nova minuta.', 'danger');
                }
            ).finally(function() {
                $scope.creating = false;
            });
        }

        // Initialize tabs from server
        $http.get('/api/documents').then(
            function(response) {
                if (response.data && response.data.success) {
                    if (response.data.documents.length > 0) {
                        $scope.tabs = response.data.documents.map(doc => ({
                            id: doc.id,
                            title: doc.title,
                            docId: doc.id
                        }));
                        $scope.selectTab($scope.tabs[0].id);
                    } else {
                        createNewDocument('Petição Inicial');
                    }
                } else {
                    showAlert('Erro ao carregar documentos.', 'danger');
                }
            },
            function(error) {
                showAlert('Erro ao carregar documentos.', 'danger');
            }
        );

        $scope.addTab = function() {
            $scope.openNewDocModal();
        };

        $scope.removeTab = function(tabToRemove) {
            if ($scope.tabs.length === 1) {
                showAlert('You cannot remove the last tab.', 'warning');
                return;
            }

            $http.delete('/api/document/' + tabToRemove.docId).then(
                function(response) {
                    if (response.data && response.data.success) {
                        $scope.tabs = $scope.tabs.filter(tab => tab.id !== tabToRemove.id);
                        if ($scope.activeTabId === tabToRemove.id) {
                            $scope.selectTab($scope.tabs[0].id);
                        }
                    } else {
                        showAlert('Error deleting document.', 'danger');
                    }
                },
                function(error) {
                    showAlert('Error deleting document.', 'danger');
                }
            );
        };

        $scope.selectTab = function(tabId) {
            $scope.activeTabId = tabId;
            const tab = $scope.getActiveTab();
            if (tab && tab.docId) {
                $scope.fetchDocPermissions(tab.docId);
            }
        };

        $scope.getActiveTab = function() {
            return $scope.tabs.find(tab => tab.id === $scope.activeTabId);
        };
        
        $scope.getDocUrl = function() {
            const activeTab = $scope.getActiveTab();
            if (activeTab && activeTab.docId) {
                var url = 'https://docs.google.com/document/d/' + activeTab.docId + '/edit?_k=' + ($scope.iframeKey || '1');
                return $sce.trustAsResourceUrl(url);
            }
            return '';
        };

        $scope.getDocEditUrl = function() {
            const activeTab = $scope.getActiveTab();
            if (activeTab && activeTab.docId) {
                return 'https://docs.google.com/document/d/' + activeTab.docId + '/edit';
            }
            return '';
        };

        // --- Legal Vocabulary & Floating Keywords Logic ---
        $scope.keywords = [];
        $scope.floatingMinimized = false;
        $scope.activeTooltip = null;
        $scope.editingKeywords = false;
        $scope.keywordsForm = [];

        // Carregar palavras-chave do servidor
        function loadKeywords() {
            $http.get('/api/keywords').then(
                function(response) {
                    if (response.data && response.data.success) {
                        $scope.keywords = response.data.keywords;
                    }
                },
                function(error) {
                    console.error('Erro ao carregar palavras-chave:', error);
                }
            );
        }
        loadKeywords();

        $scope.toggleFloating = function() {
            $scope.floatingMinimized = !$scope.floatingMinimized;
            $scope.activeTooltip = null;
        };

        $scope.showTooltip = function(kw) {
            $scope.activeTooltip = kw;
        };

        $scope.hideTooltip = function() {
            $scope.activeTooltip = null;
        };

        // Copiar o dado real para a área de transferência
        $scope.copyKeyword = function(kw) {
            if (!kw || !kw.value) return;

            const textToCopy = kw.value;

            function fallbackCopy(text) {
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.position = "fixed";
                textArea.style.opacity = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                    markCopied(kw);
                } catch (err) {
                    showAlert('Erro ao copiar para a área de transferência.', 'danger');
                }
                document.body.removeChild(textArea);
            }

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(textToCopy).then(
                    function() {
                        markCopied(kw);
                    },
                    function() {
                        fallbackCopy(textToCopy);
                    }
                );
            } else {
                fallbackCopy(textToCopy);
            }
        };

        function markCopied(kw) {
            kw.copied = true;
            showAlert('📋 Copiado para a área de transferência: "' + kw.value + '" (Cole no documento com Ctrl+V)', 'success');
            $timeout(function() {
                kw.copied = false;
            }, 2000);
        }

        // Modal de Edição de Palavras-Chave
        $scope.openEditModal = function() {
            $scope.keywordsForm = angular.copy($scope.keywords);
            $scope.editingKeywords = true;
        };

        $scope.closeEditModal = function() {
            $scope.editingKeywords = false;
        };

        $scope.saveKeywordsForm = function() {
            $http.post('/api/keywords', { keywords: $scope.keywordsForm }).then(
                function(response) {
                    if (response.data && response.data.success) {
                        $scope.keywords = angular.copy($scope.keywordsForm);
                        $scope.editingKeywords = false;
                        showAlert('Palavras-chave e dados da peça atualizados com sucesso!', 'success');
                    } else {
                        showAlert('Erro ao salvar palavras-chave: ' + (response.data.message || ''), 'danger');
                    }
                },
                function(error) {
                    showAlert('Erro de comunicação ao salvar palavras-chave.', 'danger');
                }
            );
        };

        $scope.addNewKeywordField = function() {
            $scope.keywordsForm.push({
                id: 'custom_' + Date.now(),
                label: 'Novo Campo',
                value: '',
                icon: 'bi-tag-fill',
                description: 'Campo personalizado'
            });
        };

        $scope.removeKeywordField = function(index) {
            $scope.keywordsForm.splice(index, 1);
        };

        $scope.downloadPDF = function() {
            const activeTab = $scope.getActiveTab();
            if (!activeTab || !activeTab.docId) {
                showAlert('Por favor, selecione ou crie um documento antes de baixar.', 'warning');
                return;
            }

            showAlert('Exportando documento para PDF... aguarde um instante.', 'info');

            $http.get('/download/pdf?docId=' + activeTab.docId).then(
                function(response) {
                    if (response.data && response.data.success) {
                        showAlert('Sucesso: ' + response.data.message + ' Baixando ' + response.data.filename + '...', 'success');
                        if (response.data.downloadUrl) {
                            const link = document.createElement('a');
                            link.href = response.data.downloadUrl;
                            link.download = response.data.filename;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        }
                    } else {
                        showAlert('Ocorreu um erro: ' + (response.data.message || 'Erro desconhecido'), 'danger');
                    }
                },
                function(error) {
                    let errorMessage = 'Ocorreu um erro ao baixar o arquivo.';
                    if (error.data && error.data.message) {
                        errorMessage = error.data.message;
                    } else if (error.statusText) {
                        errorMessage = error.statusText;
                    }
                    showAlert('Erro: ' + errorMessage, 'danger');
                }
            );
        };
    });