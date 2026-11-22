        // ==========================================
        // 9. バトル更新ループ & 人間らしいボットAI
        // ==========================================
        function updateBattle(dt) {
            if (isIntroPaused) {
                const player = entities[0];
                if (player) {
                    const eyeHeight = 1.95 * player.charData.scale;
                    camera.position.set(player.mesh.position.x, eyeHeight, player.mesh.position.z);
                    camera.rotation.y = playerYaw + Math.PI;
                    camera.rotation.x = playerPitch;
                }
                return;
            }

            const activeTimeStopper = getActiveTimeStopper();
            const timeStopOverlay = document.getElementById('timeStopOverlay');
            if (timeStopOverlay) {
                timeStopOverlay.classList.toggle('hidden', !activeTimeStopper);
            }

            if (!activeTimeStopper) {
                gemSpawnTimer -= dt;
                if (gemSpawnTimer <= 0 && gems.length < 12) {
                    gemSpawnTimer = 6.5;
                    spawnGem((Math.random() - 0.5) * 3.0, (Math.random() - 0.5) * 3.0);
                }

                if (mineRingMesh) mineRingMesh.rotation.z += dt * 1.5;

                torchLights.forEach(t => {
                    t.phase += dt * 8;
                    t.light.intensity = 1.25 + Math.sin(t.phase) * 0.2;
                    t.flame.scale.setScalar(0.95 + Math.sin(t.phase * 1.3) * 0.12);
                });
            }

            // キーボード左右旋回サポート
            if (keys['KeyQ'] || keys['ArrowLeft']) targetYaw += dt * 2.2;
            if (keys['KeyE'] || keys['ArrowRight']) targetYaw -= dt * 2.2;

            // 視点の滑らか補間
            playerYaw += (targetYaw - playerYaw) * Math.min(1, dt * 18);
            playerPitch += (targetPitch - playerPitch) * Math.min(1, dt * 18);

            // エンティティ更新
            entities.forEach(ent => {
                const isFrozenByTimeStop = activeTimeStopper && activeTimeStopper.id !== ent.id;
                if (isFrozenByTimeStop) {
                    if (ent.isPlayer) {
                        const eyeHeight = 1.95 * ent.charData.scale;
                        camera.position.set(ent.mesh.position.x, eyeHeight, ent.mesh.position.z);
                        camera.rotation.y = playerYaw + Math.PI;
                        camera.rotation.x = playerPitch;
                    } else if (ent.hpBarFill && ent.mesh.userData.hpBarBg) {
                        ent.hpBarFill.scale.x = Math.max(0.001, ent.hp / ent.maxHp);
                        ent.mesh.userData.hpBarBg.lookAt(camera.position);
                    }
                    return;
                }

                if (ent.dead) {
                    ent.respawnTimer -= dt;
                    if (ent.isPlayer) {
                        document.getElementById('respawnTimerText').innerText = Math.max(1, Math.ceil(ent.respawnTimer));
                    }
                    if (ent.respawnTimer <= 0) {
                        ent.dead = false;
                        ent.hp = ent.maxHp;
                        ent.beeFormTimer = 0;
                        ent.deepBreachTimer = 0;
                        ent.timeStopTimer = 0;
                        ent.empoweredShot = false;
                        ent.maxAmmo = ent.charData.maxAmmo || 3.0;
                        ent.ammo = ent.maxAmmo;
                        ent.slowTimer = 0;
                        ent.slowAmount = 0.25;
                        ent.slipTimer = 0;
                        ent.chargeRatio = 0;
                        ent.chainLightning = null;
                        ent.slideVel.set(0, 0, 0);
                        ent.mirageUltActive = false;
                        if (ent.thirdCloneMesh) ent.thirdCloneMesh.visible = false;
                        if (ent.mirrorCloneMesh) {
                            ent.mirrorCloneMesh.position.set(-ent.spawnPos.x, 0, -ent.spawnPos.z);
                            ent.mirrorCloneMesh.visible = true;
                        }
                        if (ent.deepBreachRing) {
                            battleGroup.remove(ent.deepBreachRing);
                            ent.deepBreachRing = null;
                        }
                        if (ent.beeMesh) {
                            ent.beeMesh.visible = false;
                            ent.mesh = ent.normalMesh;
                        }
                        ent.mesh.position.copy(ent.spawnPos);
                        ent.mesh.position.y = 0;
                        if (!ent.isPlayer && ent.charData.id !== 'deep') ent.mesh.visible = true;
                        else ent.mesh.visible = false;
                        if (ent.isPlayer) document.getElementById('respawnOverlay').classList.add('hidden');
                    }
                    return;
                }

                // ディープのウルト（地面から飛び出て3秒間周囲5m以内の敵をすべて弾き飛ばす）更新
                if (ent.charData.id === 'deep') {
                    if ((ent.deepBreachTimer || 0) > 0) {
                        ent.deepBreachTimer -= dt;
                        ent.mesh.visible = true;
                        ent.mesh.position.y = 0.45 + Math.abs(Math.sin(clock.elapsedTime * 7.5)) * 1.1;
                        if (ent.deepBreachRing) {
                            ent.deepBreachRing.position.set(ent.mesh.position.x, 0.12, ent.mesh.position.z);
                        }
                        // 周囲半径5.0m以内の敵をすべて外へ弾き飛ばす
                        entities.forEach(target => {
                            if (target.dead || target.team === ent.team) return;
                            const pushDiff = target.mesh.position.clone().sub(ent.mesh.position);
                            pushDiff.y = 0;
                            const dist = pushDiff.length();
                            if (dist < 5.0) {
                                if (dist < 0.05) {
                                    pushDiff.set(Math.random() - 0.5, 0, Math.random() - 0.5);
                                }
                                pushDiff.normalize();
                                const pushStep = Math.max(5.2 - dist, 14.0 * dt);
                                moveEntityWithSlide(target, pushDiff.x * pushStep, pushDiff.z * pushStep, 1.0);
                            }
                        });
                        if (ent.deepBreachTimer <= 0) {
                            ent.deepBreachTimer = 0;
                            ent.mesh.position.y = 0;
                            ent.mesh.visible = false;
                            if (ent.deepBreachRing) {
                                battleGroup.remove(ent.deepBreachRing);
                                ent.deepBreachRing = null;
                            }
                            spawnShockwave(ent.mesh.position, 3.0, 0x0284c7);
                        }
                    } else {
                        ent.mesh.visible = false;
                        ent.mesh.position.y = 0;
                    }
                }

                // フォーエバーの蜂変身タイマー（7秒間経過で元の姿＆リロード1つ＆一人称視点に戻る）
                if (ent.charData.id === 'forever' && (ent.beeFormTimer || 0) > 0) {
                    ent.beeFormTimer -= dt;
                    if (ent.beeMesh && ent.beeMesh.userData.beeParts) {
                        const bp = ent.beeMesh.userData.beeParts;
                        const flap = Math.sin(clock.elapsedTime * 42) * 0.45;
                        bp.wingL.rotation.z = 0.75 + flap;
                        bp.wingR.rotation.z = -0.75 - flap;
                        if (bp.swingTimer > 0) {
                            bp.swingTimer = Math.max(0, bp.swingTimer - dt);
                            bp.swordPivot.rotation.y = Math.sin((1 - bp.swingTimer / 0.28) * Math.PI) * 1.9;
                        } else {
                            bp.swordPivot.rotation.y = 0;
                        }
                    }
                    if (ent.beeFormTimer <= 0) {
                        ent.beeFormTimer = 0;
                        ent.maxAmmo = 1.0;
                        ent.ammo = Math.min(1.0, ent.ammo);
                        if (ent.beeMesh) {
                            ent.beeMesh.visible = false;
                            ent.normalMesh.position.copy(ent.beeMesh.position);
                            ent.normalMesh.rotation.copy(ent.beeMesh.rotation);
                            ent.normalMesh.visible = !ent.isPlayer;
                            ent.mesh = ent.normalMesh;
                        }
                    }
                }

                // クロノスの時間停止タイマー更新
                if (ent.charData.id === 'chronos' && (ent.timeStopTimer || 0) > 0) {
                    ent.timeStopTimer = Math.max(0, ent.timeStopTimer - dt);
                }

                // ボルティングライトのウルト連鎖稲妻（壁の裏に隠れない限り同チームと延々連鎖）
                if (ent.chainLightning) {
                    const cl = ent.chainLightning;
                    const teammates = entities.filter(other =>
                        !other.dead && other.id !== ent.id && !other.isTurret &&
                        other.team === ent.team && hasLineOfSight(ent.mesh.position, other.mesh.position)
                    );
                    if (teammates.length === 0) {
                        ent.chainLightning = null;
                    } else {
                        cl.pulseTimer -= dt;
                        if (cl.pulseTimer <= 0) {
                            cl.pulseTimer = 0.55;
                            teammates.forEach(mate => {
                                spawnChainArcVisual(ent.mesh.position, mate.mesh.position);
                                applyDamage(cl.attacker, mate, 200, { noUltGain: true });
                                if (!mate.dead && !mate.chainLightning) {
                                    mate.chainLightning = {
                                        attacker: cl.attacker,
                                        team: cl.team,
                                        pulseTimer: 0.55
                                    };
                                }
                            });
                        }
                    }
                }

                // 状態異常タイマー更新（スロウ・毒・速度バフ・氷上スリップ）
                if (ent.slowTimer > 0) ent.slowTimer = Math.max(0, ent.slowTimer - dt);
                if ((ent.poisonTimer || 0) > 0) {
                    ent.poisonTimer = Math.max(0, ent.poisonTimer - dt);
                    const pDmg = (ent.poisonDps || 380) * dt;
                    ent.hp -= pDmg;
                    ent.combatCooldown = 3.0;
                    if (ent.hp <= 0) {
                        ent.hp = 1;
                        applyDamage(ent.poisonAttacker || ent, ent, 10, { noUltGain: true });
                        if (ent.dead) return;
                    }
                }
                if (ent.speedBuffTimer > 0) ent.speedBuffTimer = Math.max(0, ent.speedBuffTimer - dt);
                if (ent.slipTimer > 0) ent.slipTimer = Math.max(0, ent.slipTimer - dt);
                if (ent.ramCooldown > 0) ent.ramCooldown = Math.max(0, ent.ramCooldown - dt);
                const speedMult = (ent.slowTimer > 0 ? (1.0 - (ent.slowAmount || 0.25)) : 1.0) * (ent.speedBuffTimer > 0 ? 1.2 : 1.0);

                // サーカス会場タレットの周囲回復＆速度+20%オーラ処理（壊されるまで永続）
                if (ent.isTurret && ent.charData.id === 'circus_tent') {
                    if (ent.hpBarFill && ent.mesh.userData.hpBarBg) {
                        ent.hpBarFill.scale.x = Math.max(0.001, ent.hp / ent.maxHp);
                        ent.mesh.userData.hpBarBg.lookAt(camera.position);
                    }
                    entities.forEach(ally => {
                        if (ally.dead || ally.isTurret || ally.team !== ent.team) return;
                        const dist = Math.hypot(ally.mesh.position.x - ent.mesh.position.x, ally.mesh.position.z - ent.mesh.position.z);
                        if (dist <= 6.5) {
                            ally.hp = Math.min(ally.maxHp, ally.hp + 300 * dt);
                            ally.speedBuffTimer = Math.max(ally.speedBuffTimer || 0, 0.25);
                        }
                    });
                    return;
                }

                // リロード＆非戦闘時の自然回復
                const currentMaxAmmo = ent.maxAmmo || 3.0;
                const effectiveReloadTime = (ent.charData.id === 'forever' && (ent.beeFormTimer || 0) > 0)
                    ? 0.85
                    : ent.charData.reloadTime;
                if (ent.ammo < currentMaxAmmo) {
                    ent.ammo = Math.min(currentMaxAmmo, ent.ammo + dt / effectiveReloadTime);
                }
                // クロノス専用：ウルトは時間経過でのみ自動チャージされる（通常攻撃では溜まらない）
                if (ent.charData.id === 'chronos' && (ent.timeStopTimer || 0) <= 0) {
                    ent.ultCharge = Math.min(100, ent.ultCharge + dt * 5.0);
                }
                // マリオネット専用：ウルトが自動でチャージされ、満タンになると3回分のワープストックを獲得
                if (ent.charData.id === 'marionette' && (ent.ultUsesLeft || 0) <= 0) {
                    ent.ultCharge = Math.min(100, ent.ultCharge + dt * 10.5);
                    if (ent.ultCharge >= 99.9) {
                        ent.ultCharge = 0;
                        ent.ultUsesLeft = 3;
                        if (ent.isPlayer) {
                            addKillFeed('ウルト準備完了！ランダムワープ3回使用可能！', 'text-amber-300');
                        }
                    }
                }
                ent.combatCooldown -= dt;
                if (ent.combatCooldown <= 0 && ent.hp < ent.maxHp) {
                    ent.hp = Math.min(ent.maxHp, ent.hp + ent.maxHp * 0.14 * dt);
                }

                // ケンタウロス専用：走り続けると速度(3.4→12.3)と衝突火力(350→1200)が上昇し、体当たりダメージ発生
                if (ent.charData.id === 'centaur') {
                    const currentHorizontalSpd = Math.hypot(ent.vel.x, ent.vel.z);
                    if (currentHorizontalSpd > 0.8) {
                        ent.chargeRatio = Math.min(1.0, (ent.chargeRatio || 0) + dt * 0.36);
                    } else {
                        ent.chargeRatio = Math.max(0, (ent.chargeRatio || 0) - dt * 1.6);
                    }

                    if (ent.ramCooldown <= 0 && currentHorizontalSpd > 1.2) {
                        const ramDamage = Math.round(350 + (1200 - 350) * ent.chargeRatio);
                        for (const target of entities) {
                            if (target.dead || target.team === ent.team) continue;
                            if (ent.mesh.position.distanceTo(target.mesh.position) <= 1.55) {
                                ent.ramCooldown = 0.75;
                                applyDamage(ent, target, ramDamage);
                                spawnShockwave(target.mesh.position, 2.2, 0x38bdf8);
                                const push = target.mesh.position.clone().sub(ent.mesh.position);
                                push.y = 0;
                                if (push.lengthSq() > 0.01) {
                                    push.normalize();
                                    moveEntityWithSlide(target, push.x * 2.4, push.z * 2.4, 1.0);
                                }
                                break;
                            }
                        }
                    }
                }

                if (ent.isPlayer) {
                    let forwardInput = 0;
                    let rightInput = 0;
                    if (keys['KeyW'] || keys['ArrowUp']) forwardInput += 1;
                    if (keys['KeyS'] || keys['ArrowDown']) forwardInput -= 1;
                    if (keys['KeyD']) rightInput += 1;
                    if (keys['KeyA']) rightInput -= 1;

                    if (Math.abs(moveInput.x) > 0.05 || Math.abs(moveInput.z) > 0.05) {
                        forwardInput = -moveInput.z;
                        rightInput = moveInput.x;
                    }

                    const len = Math.hypot(forwardInput, rightInput);
                    if (len > 1) {
                        forwardInput /= len;
                        rightInput /= len;
                    }

                    const fwdX = Math.sin(playerYaw);
                    const fwdZ = Math.cos(playerYaw);
                    const rightX = -Math.cos(playerYaw);
                    const rightZ = Math.sin(playerYaw);

                    const effectiveSpeed = ent.charData.id === 'centaur'
                        ? (3.4 + (12.3 - 3.4) * (ent.chargeRatio || 0))
                        : ((ent.charData.id === 'forever' && (ent.beeFormTimer || 0) > 0) ? 8.8 : ent.charData.speed);

                    const desiredVx = (fwdX * forwardInput + rightX * rightInput) * effectiveSpeed * speedMult;
                    const desiredVz = (fwdZ * forwardInput + rightZ * rightInput) * effectiveSpeed * speedMult;

                    let vx = desiredVx;
                    let vz = desiredVz;
                    if (ent.slipTimer > 0) {
                        // 氷結フィールド上では慣性が強くなりツルツル滑る
                        ent.slideVel.x += (desiredVx - ent.slideVel.x) * Math.min(1, dt * 1.4);
                        ent.slideVel.z += (desiredVz - ent.slideVel.z) * Math.min(1, dt * 1.4);
                        vx = ent.slideVel.x;
                        vz = ent.slideVel.z;
                    } else {
                        ent.slideVel.set(desiredVx, 0, desiredVz);
                    }
                    const prevPx = ent.mesh.position.x;
                    const prevPz = ent.mesh.position.z;
                    moveEntityWithSlide(ent, vx, vz, dt);
                    if (ent.charData.id === 'bolting_light') {
                        const movedDist = Math.hypot(ent.mesh.position.x - prevPx, ent.mesh.position.z - prevPz);
                        ent.ultCharge = Math.min(100, ent.ultCharge + movedDist * (2.2 / 3));
                    }

                    // ミラージュ専用：影分身（点対称移動＆ウルト中の3体円回転）更新
                    if (ent.charData.id === 'mirage') {
                        if (ent.mirageUltActive) {
                            // 3体目がいる間は3体が正三角形を描きながら円回転する
                            ent.mirageAnchorPos.x = THREE.MathUtils.clamp(ent.mirageAnchorPos.x + vx * dt, -14.5, 14.5);
                            ent.mirageAnchorPos.z = THREE.MathUtils.clamp(ent.mirageAnchorPos.z + vz * dt, -18.5, 18.5);
                            ent.mirageSpinAngle = (ent.mirageSpinAngle || 0) + dt * 3.4;
                            const orbitR = 3.1;

                            const bodies = [ent.mesh, ent.mirrorCloneMesh, ent.thirdCloneMesh];
                            bodies.forEach((bMesh, idx) => {
                                if (!bMesh) return;
                                bMesh.visible = true;
                                const theta = ent.mirageSpinAngle + (idx * (Math.PI * 2)) / 3;
                                const bx = THREE.MathUtils.clamp(ent.mirageAnchorPos.x + Math.cos(theta) * orbitR, -16.5, 16.5);
                                const bz = THREE.MathUtils.clamp(ent.mirageAnchorPos.z + Math.sin(theta) * orbitR, -20.5, 20.5);
                                bMesh.position.set(bx, 0, bz);
                                bMesh.rotation.y = theta + Math.PI * 0.5;
                                animateCharacterLimbs(bMesh, dt, 1.0);
                            });
                        } else {
                            // 通常時：マップ中央(0,0)に対して点対称な位置・向きで同時に動く
                            if (ent.mirrorCloneMesh) {
                                ent.mirrorCloneMesh.visible = true;
                                let symX = THREE.MathUtils.clamp(-ent.mesh.position.x, -16.8, 16.8);
                                let symZ = THREE.MathUtils.clamp(-ent.mesh.position.z, -20.8, 20.8);
                                if (isPointInWall(symX, symZ, 0.6)) {
                                    // 壁と重なる場合のみ最寄りの非壁座標へ少し寄せる
                                    const stepBack = new THREE.Vector3(symX, 0, symZ).normalize().multiplyScalar(-0.8);
                                    for (let k = 0; k < 5 && isPointInWall(symX, symZ, 0.6); k++) {
                                        symX += stepBack.x;
                                        symZ += stepBack.z;
                                    }
                                }
                                ent.mirrorCloneMesh.position.set(symX, 0, symZ);
                                ent.mirrorCloneMesh.rotation.y = playerYaw + Math.PI;
                                const moveRatio = Math.hypot(vx, vz) / ent.charData.speed;
                                animateCharacterLimbs(ent.mirrorCloneMesh, dt, moveRatio);
                            }
                        }
                    }

                    // カメラ制御（フォーエバーの蜂変身中・ディープ飛び出し中・ミラージュ3体円回転中は三人称視点、それ以外は一人称視点）
                    const isThirdPersonBee = (ent.charData.id === 'forever' && (ent.beeFormTimer || 0) > 0)
                        || (ent.charData.id === 'deep' && (ent.deepBreachTimer || 0) > 0)
                        || (ent.charData.id === 'mirage' && ent.mirageUltActive);
                    if (isThirdPersonBee) {
                        ent.mesh.visible = true;
                        if (!(ent.charData.id === 'mirage' && ent.mirageUltActive)) {
                            ent.mesh.rotation.y = playerYaw;
                        }
                        if (fpsWeaponGroup) fpsWeaponGroup.visible = false;
                        document.getElementById('fpsCrosshair').classList.add('hidden');

                        const camDist = 5.4;
                        const camHeight = 3.2 - playerPitch * 2.2;
                        const desiredCamX = ent.mesh.position.x - fwdX * camDist;
                        const desiredCamZ = ent.mesh.position.z - fwdZ * camDist;
                        camera.position.lerp(new THREE.Vector3(desiredCamX, camHeight, desiredCamZ), Math.min(1, dt * 14));
                        camera.lookAt(
                            ent.mesh.position.x + fwdX * 5.0,
                            1.35 + playerPitch * 3.0,
                            ent.mesh.position.z + fwdZ * 5.0
                        );
                    } else {
                        ent.mesh.visible = false;
                        if (fpsWeaponGroup) fpsWeaponGroup.visible = true;
                        document.getElementById('fpsCrosshair').classList.remove('hidden');

                        const moveMag = Math.hypot(vx, vz) / ent.charData.speed;
                        if (moveMag > 0.05) cameraBobTime += dt * 10;
                        const bobY = Math.sin(cameraBobTime) * 0.04 * moveMag;
                        const eyeHeight = 1.95 * ent.charData.scale + bobY;

                        camera.position.set(ent.mesh.position.x, eyeHeight, ent.mesh.position.z);
                        camera.rotation.y = playerYaw + Math.PI;
                        camera.rotation.x = playerPitch;

                        if (fpsWeaponGroup) {
                            weaponRecoil = Math.max(0, weaponRecoil - dt * 0.9);
                            fpsWeaponGroup.position.set(
                                0.36 + Math.cos(cameraBobTime * 0.5) * 0.015 * moveMag,
                                -0.32 + Math.abs(Math.sin(cameraBobTime * 0.5)) * 0.015 * moveMag,
                                -0.58 + weaponRecoil
                            );
                        }
                    }
                    if (muzzleFlashTimer > 0) {
                        muzzleFlashTimer -= dt;
                        if (muzzleFlashTimer <= 0 && muzzleFlashMesh) muzzleFlashMesh.visible = false;
                    }

                    // プレイヤーHUD更新
                    document.getElementById('hudHpBar').style.width = `${(ent.hp / ent.maxHp) * 100}%`;
                    document.getElementById('hudHpText').innerText = Math.ceil(ent.hp);
                    const maxSlots = Math.round(ent.maxAmmo || 3);
                    for (let s = 0; s < 4; s++) {
                        const slotEl = document.getElementById(`ammoSlot-${s}`);
                        const barEl = document.getElementById(`ammoBar-${s}`);
                        if (slotEl) slotEl.classList.toggle('hidden', s >= maxSlots);
                        if (barEl) {
                            const slotFill = Math.max(0, Math.min(1, ent.ammo - s)) * 100;
                            barEl.style.width = `${slotFill}%`;
                            if (s === 0 && ent.charData.id === 'forever' && ent.empoweredShot && (ent.beeFormTimer || 0) <= 0) {
                                barEl.className = 'h-full bg-fuchsia-400 w-full';
                            } else {
                                barEl.className = 'h-full bg-amber-400 w-full';
                            }
                        }
                    }
                    const crosshairDot = document.getElementById('crosshairDot');
                    if (crosshairDot) {
                        crosshairDot.className = (ent.charData.id === 'forever' && ent.empoweredShot)
                            ? 'w-2.5 h-2.5 rounded-full bg-fuchsia-400 shadow animate-ping'
                            : 'w-1.5 h-1.5 rounded-full bg-yellow-300 shadow';
                    }
                    const ultPct = Math.floor(ent.ultCharge);
                    const ultBtn = document.getElementById('ultBtn');
                    if (ent.charData.id === 'chronos' && (ent.timeStopTimer || 0) > 0) {
                        document.getElementById('ultPctText').innerText = `解除 ${ent.timeStopTimer.toFixed(1)}s`;
                        document.getElementById('ultChargeFill').style.height = `${(ent.timeStopTimer / 5.0) * 100}%`;
                        ultBtn.classList.add('border-yellow-300', 'text-yellow-300', 'animate-pulse-fast');
                        ultBtn.classList.remove('border-slate-600', 'text-slate-400');
                    } else if (ent.charData.id === 'forever' && (ent.beeFormTimer || 0) > 0) {
                        document.getElementById('ultPctText').innerText = `${ent.beeFormTimer.toFixed(1)}s`;
                        document.getElementById('ultChargeFill').style.height = `${(ent.beeFormTimer / 7.0) * 100}%`;
                        ultBtn.classList.add('border-yellow-300', 'text-yellow-300', 'animate-pulse-fast');
                        ultBtn.classList.remove('border-slate-600', 'text-slate-400');
                    } else if (ent.charData.id === 'deep' && (ent.deepBreachTimer || 0) > 0) {
                        document.getElementById('ultPctText').innerText = `${ent.deepBreachTimer.toFixed(1)}s`;
                        document.getElementById('ultChargeFill').style.height = `${(ent.deepBreachTimer / 3.0) * 100}%`;
                        ultBtn.classList.add('border-yellow-300', 'text-yellow-300', 'animate-pulse-fast');
                        ultBtn.classList.remove('border-slate-600', 'text-slate-400');
                    } else if (ent.charData.id === 'mirage' && ent.mirageUltActive) {
                        document.getElementById('ultPctText').innerText = '解除';
                        document.getElementById('ultChargeFill').style.height = '100%';
                        ultBtn.classList.add('border-yellow-300', 'text-yellow-300', 'animate-pulse-fast');
                        ultBtn.classList.remove('border-slate-600', 'text-slate-400');
                    } else if (ent.charData.id === 'marionette' && (ent.ultUsesLeft || 0) > 0) {
                        document.getElementById('ultPctText').innerText = `残${ent.ultUsesLeft}回`;
                        document.getElementById('ultChargeFill').style.height = `${(ent.ultUsesLeft / 3) * 100}%`;
                        ultBtn.classList.add('border-yellow-300', 'text-yellow-300', 'animate-pulse-fast');
                        ultBtn.classList.remove('border-slate-600', 'text-slate-400');
                    } else {
                        document.getElementById('ultPctText').innerText = `${ultPct}%`;
                        document.getElementById('ultChargeFill').style.height = `${ultPct}%`;
                        if (ent.ultCharge >= 99.9) {
                            ultBtn.classList.add('border-yellow-300', 'text-yellow-300', 'animate-pulse-fast');
                            ultBtn.classList.remove('border-slate-600', 'text-slate-400');
                        } else {
                            ultBtn.classList.remove('border-yellow-300', 'text-yellow-300', 'animate-pulse-fast');
                            ultBtn.classList.add('border-slate-600', 'text-slate-400');
                        }
                    }
                } else {
                    updateBotAI(ent, dt);
                    if (ent.hpBarFill && ent.mesh.userData.hpBarBg) {
                        ent.hpBarFill.scale.x = Math.max(0.001, ent.hp / ent.maxHp);
                        ent.mesh.userData.hpBarBg.lookAt(camera.position);
                    }
                }

                // エメラルド拾得判定
                for (let i = gems.length - 1; i >= 0; i--) {
                    const g = gems[i];
                    if (ent.mesh.position.distanceTo(g.mesh.position) < 1.35) {
                        ent.gems++;
                        battleGroup.remove(g.mesh);
                        gems.splice(i, 1);
                        updateGemHUD();
                    }
                }
            });

            // エメラルド浮遊回転アニメーション（時間停止中は静止）
            if (!activeTimeStopper) {
                gems.forEach(g => {
                    g.phase += dt * 3;
                    g.mesh.rotation.y += dt * 2.2;
                    g.mesh.position.y = 0.65 + Math.sin(g.phase) * 0.14;
                });

                // アルケミーが設置した三角形魔法瓶の浮遊・回転アニメーション（再押下されるまで残り続ける）
                alchemyTriangles.forEach(tri => {
                    tri.placedTime += dt;
                    tri.flasks.forEach((f, idx) => {
                        f.bottle.rotation.y += dt * 3.5;
                        f.bottle.position.y = Math.sin(tri.placedTime * 4 + idx) * 0.12;
                    });
                });

                    // 弾丸の移動・壁判定・命中判定
                for (let i = projectiles.length - 1; i >= 0; i--) {
                    const p = projectiles[i];
                    if (p.lifeTimer !== undefined) {
                        p.lifeTimer -= dt;
                        if (p.lifeTimer <= 0) {
                            battleGroup.remove(p.mesh);
                            projectiles.splice(i, 1);
                            continue;
                        }
                    }

                    // ホーミング弾（レアンなど）
                    if (p.homing) {
                        const target = findNearestEnemy({ team: p.team, mesh: p.mesh });
                        if (target) {
                            const desired = target.mesh.position.clone().sub(p.mesh.position);
                            desired.y = 0;
                            if (desired.lengthSq() > 0.01) {
                                desired.normalize();
                                p.dir.lerp(desired, Math.min(1, dt * 3.2)).normalize();
                            }
                        }
                    }

                    const step = p.speed * dt;
                    const nextX = p.mesh.position.x + p.dir.x * step;
                    const nextZ = p.mesh.position.z + p.dir.z * step;
                    p.traveled += step;

                    if (p.isChronosClock) {
                        p.mesh.rotation.y += dt * 10;
                    }

                    // 山なり曲射弾（ポム＆リル）
                    if (p.isLobbed) {
                        const progress = Math.min(1, p.traveled / p.maxRange);
                        p.mesh.position.set(nextX, 1.3 + Math.sin(progress * Math.PI) * 4.2, nextZ);
                        if (progress >= 1.0) {
                            spawnShockwave(p.mesh.position, p.splashRadius || 2.8, 0xf97316);
                            entities.forEach(target => {
                                if (target.dead || target.team === p.team) return;
                                const d = Math.hypot(target.mesh.position.x - p.mesh.position.x, target.mesh.position.z - p.mesh.position.z);
                                if (d <= (p.splashRadius || 2.8)) {
                                    applyDamage(p.owner, target, p.damage);
                                }
                            });
                            battleGroup.remove(p.mesh);
                            projectiles.splice(i, 1);
                        }
                        continue;
                    }

                    // 壁衝突・反射判定
                    if (!p.wallPierce) {
                        const hitWallX = isPointInWall(nextX, p.mesh.position.z, 0.25);
                        const hitWallZ = isPointInWall(p.mesh.position.x, nextZ, 0.25);
                        if (hitWallX || hitWallZ) {
                            if ((p.bouncesLeft || 0) > 0) {
                                p.bouncesLeft -= 1;
                                if (hitWallX) p.dir.x = -p.dir.x;
                                if (hitWallZ) p.dir.z = -p.dir.z;
                                p.dir.normalize();
                                p.hitSet.clear();
                                continue;
                            } else {
                                battleGroup.remove(p.mesh);
                                projectiles.splice(i, 1);
                                continue;
                            }
                        }
                    }

                    p.mesh.position.x = nextX;
                    p.mesh.position.z = nextZ;

                    // イージスの鏡壁による全反射判定（敵の弾丸をすべて跳ね返し、自分のチームの弾として敵にダメージを与える）
                    let reflectedByMirror = false;
                    for (const mw of mirrorWalls) {
                        if (mw.team !== p.team && !(p.reflectedByIds && p.reflectedByIds.has(mw.owner.id))) {
                            const relX = p.mesh.position.x - mw.pos.x;
                            const relZ = p.mesh.position.z - mw.pos.z;
                            const tangentX = -mw.normal.z;
                            const tangentZ = mw.normal.x;
                            const alongNormal = relX * mw.normal.x + relZ * mw.normal.z;
                            const alongTangent = relX * tangentX + relZ * tangentZ;

                            if (Math.abs(alongNormal) <= 0.75 && Math.abs(alongTangent) <= mw.halfWidth + 0.35) {
                                if (!p.reflectedByIds) p.reflectedByIds = new Set();
                                p.reflectedByIds.add(mw.owner.id);
                                p.owner = mw.owner;
                                p.team = mw.team;
                                p.hitSet.clear();
                                p.traveled = 0;

                                // 鏡の法線方向へ入射角を反射
                                const dot = p.dir.x * mw.normal.x + p.dir.z * mw.normal.z;
                                p.dir.x = p.dir.x - 2 * dot * mw.normal.x;
                                p.dir.z = p.dir.z - 2 * dot * mw.normal.z;
                                // 常に鏡の前方へ飛び出すよう保証
                                if (p.dir.x * mw.normal.x + p.dir.z * mw.normal.z < 0.25) {
                                    p.dir.copy(mw.normal);
                                }
                                p.dir.normalize();
                                p.mesh.position.x += mw.normal.x * 0.85;
                                p.mesh.position.z += mw.normal.z * 0.85;

                                spawnShockwave(p.mesh.position, 2.2, 0xfacc15);
                                reflectedByMirror = true;
                                break;
                            }
                        }
                    }
                    if (reflectedByMirror) continue;

                    let removed = false;
                    for (const target of entities) {
                        if (target.dead || target.id === p.owner.id || p.hitSet.has(target.id)) continue;
                        const dist = Math.hypot(target.mesh.position.x - p.mesh.position.x, target.mesh.position.z - p.mesh.position.z);
                        if (dist <= 1.05) {
                            if (target.team === p.team) {
                                if (p.canHealAllies && !target.isTurret) {
                                    p.hitSet.add(target.id);
                                    target.hp = Math.min(target.maxHp, target.hp + (p.healAmount || 250));
                                    spawnShockwave(target.mesh.position, 1.5, 0x34d399);
                                    if (!p.pierce) {
                                        battleGroup.remove(p.mesh);
                                        projectiles.splice(i, 1);
                                        removed = true;
                                        break;
                                    }
                                }
                            } else {
                                p.hitSet.add(target.id);
                                let actualDamage = p.damage;
                                // ミラージュの交差2連弾：1発目410ダメージ、2発とも同じ敵に当たると合計1020ダメージ＋前方ダッシュ！
                                if (p.isMirageCross && p.mirageGroupId) {
                                    if (!target.mirageHitGroups) target.mirageHitGroups = new Set();
                                    if (target.mirageHitGroups.has(p.mirageGroupId)) {
                                        actualDamage = 1020 - 410; // 2発目命中で合計1020ダメージに到達
                                        if (!p.owner.dead && p.mirageDashDir) {
                                            for (let ds = 0; ds < 6; ds++) {
                                                moveEntityWithSlide(p.owner, p.mirageDashDir.x * (2.6 / 6), p.mirageDashDir.z * (2.6 / 6), 1.0);
                                            }
                                            spawnShockwave(p.owner.mesh.position, 2.2, 0xfacc15);
                                        }
                                    } else {
                                        target.mirageHitGroups.add(p.mirageGroupId);
                                    }
                                }
                                applyDamage(p.owner, target, actualDamage, {
                                    noUltGain: p.noUltGain,
                                    healOnHit: p.healOnHit,
                                    isForeverSniperShot: p.isForeverSniperShot,
                                    isMagnartzPull: p.isMagnartzPull,
                                    isChronosClock: p.isChronosClock
                                });
                                if (!p.pierce) {
                                    battleGroup.remove(p.mesh);
                                    projectiles.splice(i, 1);
                                    removed = true;
                                    break;
                                }
                            }
                        }
                    }
                    if (removed) continue;

                    if (p.traveled >= p.maxRange) {
                        battleGroup.remove(p.mesh);
                        projectiles.splice(i, 1);
                    }
                }

                // 落雷予兆＆落雷ダメージ処理（ボルティングライト）
                for (let i = lightningStrikes.length - 1; i >= 0; i--) {
                    const ls = lightningStrikes[i];
                    ls.timer -= dt;
                    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 28);
                    ls.outerRing.material.opacity = 0.45 + pulse * 0.55;
                    ls.innerDisc.material.opacity = 0.15 + pulse * 0.35;
                    ls.beacon.material.opacity = 0.25 + pulse * 0.55;

                    if (ls.timer <= 0) {
                        const boltMesh = new THREE.Mesh(
                            new THREE.CylinderGeometry(0.28, 0.45, 11.0, 8),
                            new THREE.MeshBasicMaterial({ color: ls.isUlt ? 0xfacc15 : 0x38bdf8, transparent: true, opacity: 0.95 })
                        );
                        boltMesh.position.set(ls.pos.x, 5.5, ls.pos.z);
                        battleGroup.add(boltMesh);
                        chainBeams.push({ mesh: boltMesh, life: 0.28, maxLife: 0.28 });
                        spawnShockwave(ls.pos, 2.2, ls.isUlt ? 0xfacc15 : 0x38bdf8);

                        entities.forEach(target => {
                            if (target.dead || target.team === ls.team) return;
                            const dist = Math.hypot(target.mesh.position.x - ls.pos.x, target.mesh.position.z - ls.pos.z);
                            if (dist <= 2.15) {
                                applyDamage(ls.owner, target, ls.damage, { chainUlt: ls.isUlt });
                            }
                        });

                        battleGroup.remove(ls.mesh);
                        lightningStrikes.splice(i, 1);
                    }
                }
            }

            for (let i = chainBeams.length - 1; i >= 0; i--) {
                const cb = chainBeams[i];
                cb.life -= dt;
                cb.mesh.material.opacity = Math.max(0, cb.life / cb.maxLife);
                if (cb.life <= 0) {
                    battleGroup.remove(cb.mesh);
                    chainBeams.splice(i, 1);
                }
            }

            // イージスのウルト鏡壁更新（オーナーの正面に追従・持続終了で消去）
            for (let i = mirrorWalls.length - 1; i >= 0; i--) {
                if (activeTimeStopper) break;
                const mw = mirrorWalls[i];
                mw.duration -= dt;
                if (mw.duration <= 0 || mw.owner.dead) {
                    battleGroup.remove(mw.mesh);
                    mirrorWalls.splice(i, 1);
                    continue;
                }
                const fDir = mw.owner.isPlayer
                    ? new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw)).normalize()
                    : new THREE.Vector3(Math.sin(mw.owner.mesh.rotation.y), 0, Math.cos(mw.owner.mesh.rotation.y)).normalize();
                mw.normal.copy(fDir);
                mw.pos.set(
                    mw.owner.mesh.position.x + fDir.x * 2.2,
                    0,
                    mw.owner.mesh.position.z + fDir.z * 2.2
                );
                mw.mesh.position.copy(mw.pos);
                mw.mesh.rotation.y = Math.atan2(fDir.x, fDir.z);
            }

            // 滞留範囲フィールド（フロストのブリザード波＆氷結領域）更新（時間停止中は停止）
            for (let i = hazardZones.length - 1; i >= 0; i--) {
                if (activeTimeStopper) break;
                const hz = hazardZones[i];
                hz.duration -= dt;
                if (hz.duration <= 0) {
                    battleGroup.remove(hz.mesh);
                    hazardZones.splice(i, 1);
                    continue;
                }

                // 3D氷晶オブジェクトのアニメーション
                if (hz.centerCrystal) {
                    hz.centerCrystal.rotation.y += dt * 2.5;
                    hz.centerCrystal.position.y = 1.65 + Math.sin(clock.elapsedTime * 4) * 0.18;
                }
                if (hz.spikes) {
                    hz.spikes.forEach((sp, idx) => {
                        sp.rotation.y += dt * (idx % 2 === 0 ? 1.5 : -1.5);
                    });
                }

                if (hz.duration < 0.5) {
                    const fade = Math.max(0.05, hz.duration * 1.5);
                    hz.mesh.traverse(child => {
                        if (child.isMesh && child.material) child.material.opacity = fade;
                    });
                }

                for (const target of entities) {
                    if (target.dead || target.team === hz.team) continue;

                    let inside = false;
                    if (hz.type === 'BLIZZARD') {
                        const dx = target.mesh.position.x - hz.x;
                        const dz = target.mesh.position.z - hz.z;
                        const cosA = Math.cos(-hz.angle);
                        const sinA = Math.sin(-hz.angle);
                        const localX = dx * cosA - dz * sinA;
                        const localZ = dx * sinA + dz * cosA;
                        inside = Math.abs(localX) <= hz.halfW + 0.55 && Math.abs(localZ) <= hz.halfL + 0.55;
                    } else if (hz.type === 'ICE_RINK') {
                        const dist = Math.hypot(target.mesh.position.x - hz.x, target.mesh.position.z - hz.z);
                        inside = dist <= hz.radius + 0.45;
                    }

                    if (inside) {
                        const dmgTick = hz.dps * dt;
                        target.hp -= dmgTick;
                        target.combatCooldown = 3.0;
                        if (hz.type === 'BLIZZARD') {
                            target.slowTimer = Math.max(target.slowTimer, hz.slowDuration);
                            hz.owner.ultCharge = Math.min(100, hz.owner.ultCharge + dt * 16);
                        } else if (hz.type === 'ICE_RINK') {
                            target.slipTimer = Math.max(target.slipTimer, 0.35);
                        }

                        if (target.isPlayer && Math.random() < 0.25) {
                            const flash = document.getElementById('damageFlash');
                            flash.classList.remove('hidden');
                            setTimeout(() => flash.classList.add('hidden'), 90);
                        }

                        if (target.hp <= 0) {
                            target.hp = 1;
                            applyDamage(hz.owner, target, 10);
                        }
                    }
                }
            }

            // パーティクル（衝撃波）更新
            for (let i = particles.length - 1; i >= 0; i--) {
                const pt = particles[i];
                pt.life -= dt;
                pt.mesh.scale.addScalar(pt.expandSpeed * dt);
                pt.mesh.material.opacity = Math.max(0, pt.life / pt.maxLife);
                if (pt.life <= 0) {
                    battleGroup.remove(pt.mesh);
                    particles.splice(i, 1);
                }
            }

            // カウントダウン＆勝敗判定（時間停止中はカウントダウンも一時停止）
            const banner = document.getElementById('matchBanner');
            if (blueGems >= 10 && blueGems > redGems) {
                if (!isCountingDown || countdownTeam !== 'BLUE') {
                    isCountingDown = true;
                    countdownTeam = 'BLUE';
                    countdownTimer = 15.0;
                }
            } else if (redGems >= 10 && redGems > blueGems) {
                if (!isCountingDown || countdownTeam !== 'RED') {
                    isCountingDown = true;
                    countdownTeam = 'RED';
                    countdownTimer = 15.0;
                }
            } else {
                isCountingDown = false;
                countdownTeam = null;
                banner.classList.add('hidden');
            }

            if (isCountingDown && !activeTimeStopper) {
                countdownTimer -= dt;
                banner.classList.remove('hidden');
                const teamLabel = countdownTeam === 'BLUE' ? '青チーム勝利まで' : '赤チーム勝利まで';
                banner.innerText = `${teamLabel} ${Math.max(0, Math.ceil(countdownTimer))} 秒！`;
                if (countdownTimer <= 0) {
                    finishBattle(countdownTeam);
                }
            }
        }

        function updateBotAI(bot, dt) {
            if (bot.isTurret) return;

            // 使い魔「リル」専用AI：最も近い敵へ突撃し、周囲2.8mの敵に650範囲ダメージを与える
            if (bot.isMinion) {
                const enemy = findNearestEnemy(bot);
                if (enemy) {
                    const toEnemy = enemy.mesh.position.clone().sub(bot.mesh.position);
                    toEnemy.y = 0;
                    const dist = toEnemy.length();
                    if (dist > 1.35) {
                        toEnemy.normalize();
                        moveEntityWithSlide(bot, toEnemy.x * bot.charData.speed, toEnemy.z * bot.charData.speed, dt);
                    }
                    bot.mesh.position.y = Math.abs(Math.sin(clock.elapsedTime * 11)) * 0.16;

                    bot.aiShootCooldown -= dt;
                    if (dist <= 2.8 && bot.aiShootCooldown <= 0) {
                        bot.aiShootCooldown = 1.05;
                        spawnShockwave(bot.mesh.position, 2.8, 0xf97316);
                        const creditAttacker = bot.summoner || bot;
                        const prevUlt = creditAttacker.ultCharge;
                        entities.forEach(target => {
                            if (target.dead || target.team === bot.team) return;
                            if (bot.mesh.position.distanceTo(target.mesh.position) <= 2.8) {
                                applyDamage(creditAttacker, target, 650);
                            }
                        });
                        // リルの攻撃によるウルトチャージ増加量を通常の4分の1に補正
                        if (bot.summoner && creditAttacker.ultCharge > prevUlt) {
                            creditAttacker.ultCharge = Math.min(100, prevUlt + (creditAttacker.ultCharge - prevUlt) * 0.25);
                        }
                    }
                }
                return;
            }

            const enemy = findNearestEnemy(bot);
            const distToEnemy = enemy ? bot.mesh.position.distanceTo(enemy.mesh.position) : Infinity;
            const canSeeEnemy = enemy && !isStealthedDeep(enemy) && (bot.charData.id === 'pom' || bot.charData.id === 'deep' || hasLineOfSight(bot.mesh.position, enemy.mesh.position)) && distToEnemy <= bot.charData.projRange * 1.05;

            // 人間らしい戦術目標の更新（1.8〜3.0秒ごとに落ち着いて判断）
            bot.aiDecisionTimer -= dt;
            if (bot.aiDecisionTimer <= 0) {
                bot.aiDecisionTimer = 1.8 + Math.random() * 1.2;

                if (bot.hp < bot.maxHp * 0.35) {
                    // HPが低い時は自陣側の遮蔽物へ退避して回復を待つ
                    bot.aiState = 'RETREAT';
                    const retreatZ = bot.team === 'BLUE' ? 14 : -14;
                    bot.aiTargetPos.set((Math.random() - 0.5) * 14, 0, retreatZ);
                } else if (gems.length > 0 && Math.random() < 0.65) {
                    // 中央付近のエメラルドを回収しに行く
                    bot.aiState = 'COLLECT';
                    const targetGem = gems[Math.floor(Math.random() * gems.length)];
                    bot.aiTargetPos.set(targetGem.mesh.position.x, 0, targetGem.mesh.position.z);
                } else if (enemy) {
                    // 得意射程を保ちつつ緩やかに位置取り
                    bot.aiState = 'ENGAGE';
                    const toBot = bot.mesh.position.clone().sub(enemy.mesh.position);
                    toBot.y = 0;
                    if (toBot.lengthSq() < 0.01) toBot.set(0, 0, bot.team === 'BLUE' ? 1 : -1);
                    toBot.normalize();
                    const sideAngle = (Math.random() - 0.5) * 1.1;
                    toBot.applyAxisAngle(new THREE.Vector3(0, 1, 0), sideAngle);
                    const desiredDist = bot.charData.preferredRange;
                    bot.aiTargetPos.set(
                        THREE.MathUtils.clamp(enemy.mesh.position.x + toBot.x * desiredDist, -15, 15),
                        0,
                        THREE.MathUtils.clamp(enemy.mesh.position.z + toBot.z * desiredDist, -19, 19)
                    );
                } else {
                    bot.aiState = 'ADVANCE';
                    bot.aiTargetPos.set((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 6);
                }
            }

            // 目標地点へ向かって滑らかに移動（到着後は落ち着いて待機）
            const toTarget = bot.aiTargetPos.clone().sub(bot.mesh.position);
            toTarget.y = 0;
            const distToTarget = toTarget.length();
            const speedMult = bot.slowTimer > 0 ? (1.0 - (bot.slowAmount || 0.25)) : 1.0;
            const botBaseSpeed = bot.charData.id === 'centaur'
                ? (3.4 + (12.3 - 3.4) * (bot.chargeRatio || 0))
                : ((bot.charData.id === 'forever' && (bot.beeFormTimer || 0) > 0) ? 8.8 : bot.charData.speed);
            let moveRatio = 0;
            if (distToTarget > 0.85) {
                toTarget.normalize();
                const moveSpd = botBaseSpeed * 0.85 * speedMult;
                let vx = toTarget.x * moveSpd;
                let vz = toTarget.z * moveSpd;
                if (bot.slipTimer > 0) {
                    bot.slideVel.x += (vx - bot.slideVel.x) * Math.min(1, dt * 1.4);
                    bot.slideVel.z += (vz - bot.slideVel.z) * Math.min(1, dt * 1.4);
                    vx = bot.slideVel.x;
                    vz = bot.slideVel.z;
                } else {
                    bot.slideVel.set(vx, 0, vz);
                }
                const prevBx = bot.mesh.position.x;
                const prevBz = bot.mesh.position.z;
                moveEntityWithSlide(bot, vx, vz, dt);
                if (bot.charData.id === 'bolting_light') {
                    const movedDist = Math.hypot(bot.mesh.position.x - prevBx, bot.mesh.position.z - prevBz);
                    bot.ultCharge = Math.min(100, bot.ultCharge + movedDist * (2.2 / 3));
                }
                moveRatio = 0.85 * speedMult;
            } else {
                bot.vel.set(0, 0, 0);
                if (enemy) {
                    const lookDir = enemy.mesh.position.clone().sub(bot.mesh.position);
                    bot.mesh.rotation.y = Math.atan2(lookDir.x, lookDir.z);
                }
            }
            if (bot.charData.id === 'mirage') {
                if (bot.mirageUltActive) {
                    bot.mirageSpinAngle = (bot.mirageSpinAngle || 0) + dt * 3.4;
                    const orbitR = 3.1;
                    const bodies = [bot.mesh, bot.mirrorCloneMesh, bot.thirdCloneMesh];
                    bodies.forEach((bMesh, idx) => {
                        if (!bMesh) return;
                        bMesh.visible = true;
                        const theta = bot.mirageSpinAngle + (idx * (Math.PI * 2)) / 3;
                        const bx = THREE.MathUtils.clamp(bot.mirageAnchorPos.x + Math.cos(theta) * orbitR, -16.5, 16.5);
                        const bz = THREE.MathUtils.clamp(bot.mirageAnchorPos.z + Math.sin(theta) * orbitR, -20.5, 20.5);
                        bMesh.position.set(bx, 0, bz);
                        bMesh.rotation.y = theta + Math.PI * 0.5;
                        animateCharacterLimbs(bMesh, dt, 1.0);
                    });
                } else if (bot.mirrorCloneMesh) {
                    bot.mirrorCloneMesh.visible = true;
                    bot.mirrorCloneMesh.position.set(
                        THREE.MathUtils.clamp(-bot.mesh.position.x, -16.8, 16.8),
                        0,
                        THREE.MathUtils.clamp(-bot.mesh.position.z, -20.8, 20.8)
                    );
                    bot.mirrorCloneMesh.rotation.y = bot.mesh.rotation.y + Math.PI;
                    animateCharacterLimbs(bot.mirrorCloneMesh, dt, moveRatio);
                }
            }
            animateCharacterLimbs(bot.mesh, dt, moveRatio);

            // 人間らしい反応速度＆射撃間隔（無思考な超反応連射を防止）
            if (bot.charData.id === 'alchemy') {
                const activeTri = alchemyTriangles.find(t => t.owner.id === bot.id);
                if (activeTri) {
                    activeTri.placedTime += dt;
                    const anyEnemyNear = entities.some(e =>
                        !e.dead && e.team !== bot.team && !isStealthedDeep(e) &&
                        activeTri.flasks.some(f => Math.hypot(e.mesh.position.x - f.pos.x, e.mesh.position.z - f.pos.z) <= 2.8)
                    );
                    if (anyEnemyNear || activeTri.placedTime >= 2.2) {
                        fireWeapon(bot, new THREE.Vector3(0, 0, 1));
                        return;
                    }
                }
            }

            if (canSeeEnemy) {
                bot.aiReactionTimer -= dt;
                bot.aiShootCooldown -= dt;

                if (bot.aiReactionTimer <= 0 && bot.aiShootCooldown <= 0 && bot.ammo >= 1.0) {
                    bot.aiShootCooldown = 1.05 + Math.random() * 0.65;
                    const aimDir = enemy.mesh.position.clone().sub(bot.mesh.position);
                    aimDir.y = 0;
                    aimDir.normalize();
                    // わずかな人間らしいエイム誤差を付与
                    const inaccuracy = (Math.random() - 0.5) * 0.22;
                    aimDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), inaccuracy);
                    bot.mesh.rotation.y = Math.atan2(aimDir.x, aimDir.z);

                    if ((bot.ultCharge >= 99.9 || (bot.ultUsesLeft || 0) > 0) && distToEnemy <= bot.charData.preferredRange * 1.1) {
                        if (!(bot.charData.id === 'chronos' && (bot.timeStopTimer || 0) > 0)) {
                            executeUlt(bot, aimDir);
                        } else {
                            fireWeapon(bot, aimDir);
                        }
                    } else {
                        fireWeapon(bot, aimDir);
                    }
                }
            } else {
                // 敵を見失ったら次の視認時に再び反応遅延が発生する
                bot.aiReactionTimer = 0.5 + Math.random() * 0.35;
            }
        }

        function finishBattle(winnerTeam) {
            if (gameState === 'RESULT') return;
            gameState = 'RESULT';

            const isWin = winnerTeam === 'BLUE';
            const titleEl = document.getElementById('resultTitle');
            const subEl = document.getElementById('resultSub');
            const trophyEl = document.getElementById('resultTrophy');

            if (isWin) {
                trophies += 8;
                titleEl.innerText = 'VICTORY!';
                titleEl.className = 'text-5xl font-black text-yellow-400 text-outline mb-2';
                subEl.innerText = '青チームがエメラルドを守り切った！';
                trophyEl.innerHTML = '+8 <i class="fas fa-trophy text-lg"></i>';
                trophyEl.className = 'text-2xl font-black text-amber-400 mt-1';
            } else {
                trophies = Math.max(0, trophies - 4);
                titleEl.innerText = 'DEFEAT...';
                titleEl.className = 'text-5xl font-black text-rose-500 text-outline mb-2';
                subEl.innerText = '赤チームにエメラルドを奪われた！';
                trophyEl.innerHTML = '-4 <i class="fas fa-trophy text-lg"></i>';
                trophyEl.className = 'text-2xl font-black text-rose-400 mt-1';
            }

            document.getElementById('trophyCount').innerText = trophies;
            document.getElementById('resultKills').innerText = `${playerKills} KILLS`;
            document.getElementById('battleUI').classList.add('hidden');
            document.getElementById('fpsCrosshair').classList.add('hidden');
            document.getElementById('respawnOverlay').classList.add('hidden');
            document.getElementById('resultModal').classList.remove('hidden');
        }

        function returnToLobby() {
            gameState = 'LOBBY';
            document.getElementById('resultModal').classList.add('hidden');
            document.getElementById('battleUI').classList.add('hidden');
            document.getElementById('fpsCrosshair').classList.add('hidden');
            document.getElementById('lobbyUI').classList.remove('hidden');

            if (fpsWeaponGroup) {
                camera.remove(fpsWeaponGroup);
                fpsWeaponGroup = null;
            }

            battleGroup.visible = false;
            lobbyGroup.visible = true;
            scene.background = new THREE.Color(0x1e293b);
            scene.fog = new THREE.FogExp2(0x1e293b, 0.011);
        }

        function animate() {
            requestAnimationFrame(animate);
            const dt = Math.min(clock.getDelta(), 0.05);

            if (gameState === 'LOBBY') {
                camera.position.set(0, 2.25, 4.6);
                camera.lookAt(0, 1.25, 0);
                if (lobbyCharMesh) {
                    lobbyCharMesh.rotation.y = Math.sin(clock.elapsedTime * 0.7) * 0.45;
                    animateCharacterLimbs(lobbyCharMesh, dt, 0);
                }
                const mRing = lobbyGroup.getObjectByName('lobbyMagicRing');
                if (mRing) mRing.rotation.z += dt * 0.8;
            } else if (gameState === 'BATTLE') {
                updateBattle(dt);
            }

            renderer.render(scene, camera);
        }

        window.onload = initThree;
